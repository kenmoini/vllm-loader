import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import {
  VLLMProcess,
  ProcessStatus,
  ProcessEvent,
  VLLMConfig,
} from "@/types";
import { portManager } from "./port-manager";
import { buildVLLMArgs, getDefaultConfig } from "./vllm-config";

const DATA_DIR = process.env.DATA_PATH || "./data";
const STATE_FILE = path.join(DATA_DIR, "processes.json");
const VLLM_EXECUTABLE = process.env.VLLM_EXECUTABLE || "vllm";

interface ManagedProcess {
  info: VLLMProcess;
  process?: ChildProcess;
  logs: string[];
}

class ProcessManager extends EventEmitter {
  private static instance: ProcessManager;
  private processes: Map<string, ManagedProcess> = new Map();
  private maxLogLines = 1000;

  private constructor() {
    super();
    this.ensureDataDir();
    this.restoreState();
    this.setupShutdownHandlers();
  }

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private restoreState(): void {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
        for (const processInfo of data.processes || []) {
          // Mark previously running processes as stopped since they won't survive restart
          if (
            processInfo.status === "running" ||
            processInfo.status === "starting"
          ) {
            processInfo.status = "stopped";
            processInfo.stoppedAt = new Date().toISOString();
          }
          this.processes.set(processInfo.id, {
            info: processInfo,
            logs: [],
          });
          // Reserve the port if it was in use
          if (processInfo.status !== "stopped") {
            portManager.reserve(processInfo.port);
          }
        }
      }
    } catch (error) {
      console.error("Failed to restore process state:", error);
    }
  }

  private saveState(): void {
    try {
      const processes = Array.from(this.processes.values()).map(
        (mp) => mp.info
      );
      fs.writeFileSync(STATE_FILE, JSON.stringify({ processes }, null, 2));
    } catch (error) {
      console.error("Failed to save process state:", error);
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      console.log("Shutting down all vLLM processes...");
      const promises = Array.from(this.processes.keys()).map((id) =>
        this.kill(id).catch(console.error)
      );
      await Promise.all(promises);
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  private emitEvent(event: ProcessEvent): void {
    this.emit("process-event", event);
    this.emit(`process-${event.processId}`, event);
  }

  private addLog(processId: string, message: string, stream: "stdout" | "stderr"): void {
    const managed = this.processes.get(processId);
    if (!managed) return;

    const logLine = `[${new Date().toISOString()}] [${stream}] ${message}`;
    managed.logs.push(logLine);

    // Trim logs if they exceed max
    if (managed.logs.length > this.maxLogLines) {
      managed.logs = managed.logs.slice(-this.maxLogLines);
    }

    this.emitEvent({
      type: "log",
      processId,
      timestamp: new Date().toISOString(),
      data: {
        message: logLine,
        stream,
      },
    });
  }

  private updateStatus(processId: string, status: ProcessStatus, error?: string): void {
    const managed = this.processes.get(processId);
    if (!managed) return;

    managed.info.status = status;
    if (error) {
      managed.info.error = error;
    }

    if (status === "stopped" || status === "error") {
      managed.info.stoppedAt = new Date().toISOString();
      portManager.release(managed.info.port);
    }

    this.saveState();

    this.emitEvent({
      type: "status",
      processId,
      timestamp: new Date().toISOString(),
      data: { status },
    });
  }

  async spawn(
    modelId: string,
    modelName: string,
    modelPath: string,
    userConfig?: Partial<Omit<VLLMConfig, "port" | "host">>
  ): Promise<VLLMProcess> {
    const port = portManager.allocate();
    const config: VLLMConfig = {
      ...getDefaultConfig(port),
      ...userConfig,
      port,
      host: "127.0.0.1",
    };

    const processId = uuidv4();
    const processInfo: VLLMProcess = {
      id: processId,
      modelId,
      modelName,
      modelPath,
      port,
      status: "starting",
      startedAt: new Date().toISOString(),
      config,
    };

    const managed: ManagedProcess = {
      info: processInfo,
      logs: [],
    };

    this.processes.set(processId, managed);
    this.saveState();

    try {
      const args = buildVLLMArgs(modelPath, config);
      console.log(`Spawning vLLM: ${VLLM_EXECUTABLE} ${args.join(" ")}`);

      const childProcess = spawn(VLLM_EXECUTABLE, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      managed.process = childProcess;
      managed.info.pid = childProcess.pid;

      childProcess.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          this.addLog(processId, line, "stdout");
          // Check for ready signal
          if (
            line.includes("Uvicorn running") ||
            line.includes("Application startup complete")
          ) {
            this.updateStatus(processId, "running");
          }
        }
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          this.addLog(processId, line, "stderr");
        }
      });

      childProcess.on("error", (err) => {
        console.error(`Process ${processId} error:`, err);
        this.updateStatus(processId, "error", err.message);
      });

      childProcess.on("exit", (code, signal) => {
        console.log(
          `Process ${processId} exited with code ${code}, signal ${signal}`
        );
        const status = managed.info.status;
        if (status !== "stopping" && status !== "stopped") {
          this.updateStatus(
            processId,
            code === 0 ? "stopped" : "error",
            code !== 0 ? `Process exited with code ${code}` : undefined
          );
        } else {
          this.updateStatus(processId, "stopped");
        }
        managed.process = undefined;
      });

      // Wait a bit to detect early failures
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (managed.info.status === "error") {
        throw new Error(managed.info.error || "Process failed to start");
      }

      return managed.info;
    } catch (error) {
      portManager.release(port);
      this.updateStatus(
        processId,
        "error",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }

  async kill(processId: string, force = false): Promise<void> {
    const managed = this.processes.get(processId);
    if (!managed) {
      throw new Error(`Process ${processId} not found`);
    }

    if (!managed.process) {
      // Process already dead, just update status
      this.updateStatus(processId, "stopped");
      return;
    }

    this.updateStatus(processId, "stopping");

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Force kill after timeout
        if (managed.process) {
          managed.process.kill("SIGKILL");
        }
      }, force ? 0 : 5000);

      managed.process!.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      managed.process!.kill(force ? "SIGKILL" : "SIGTERM");
    });
  }

  async restart(processId: string): Promise<VLLMProcess> {
    const managed = this.processes.get(processId);
    if (!managed) {
      throw new Error(`Process ${processId} not found`);
    }

    const { modelId, modelName, modelPath, config } = managed.info;

    await this.kill(processId);

    // Remove port/host from config since spawn will allocate new port
    const { port: _, host: __, ...userConfig } = config;

    return this.spawn(modelId, modelName, modelPath, userConfig);
  }

  getProcess(processId: string): VLLMProcess | undefined {
    return this.processes.get(processId)?.info;
  }

  getAllProcesses(): VLLMProcess[] {
    return Array.from(this.processes.values()).map((mp) => mp.info);
  }

  getRunningProcesses(): VLLMProcess[] {
    return this.getAllProcesses().filter((p) => p.status === "running");
  }

  getLogs(processId: string, tail?: number): string[] {
    const managed = this.processes.get(processId);
    if (!managed) return [];

    if (tail && tail > 0) {
      return managed.logs.slice(-tail);
    }
    return [...managed.logs];
  }

  subscribe(
    processId: string,
    callback: (event: ProcessEvent) => void
  ): () => void {
    const handler = (event: ProcessEvent) => callback(event);
    this.on(`process-${processId}`, handler);
    return () => this.off(`process-${processId}`, handler);
  }

  subscribeAll(callback: (event: ProcessEvent) => void): () => void {
    const handler = (event: ProcessEvent) => callback(event);
    this.on("process-event", handler);
    return () => this.off("process-event", handler);
  }

  async checkHealth(processId: string): Promise<boolean> {
    const managed = this.processes.get(processId);
    if (!managed || managed.info.status !== "running") {
      return false;
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${managed.info.port}/health`,
        { signal: AbortSignal.timeout(5000) }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  removeProcess(processId: string): boolean {
    const managed = this.processes.get(processId);
    if (!managed) return false;

    if (managed.info.status === "running" || managed.info.status === "starting") {
      throw new Error("Cannot remove running process. Stop it first.");
    }

    this.processes.delete(processId);
    this.saveState();
    return true;
  }
}

export const processManager = ProcessManager.getInstance();
