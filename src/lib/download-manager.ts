import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  Download,
  DownloadStatus,
  DownloadProgress,
  DownloadEvent,
  DownloadSource,
} from "@/types";
import { modelRegistry } from "./model-registry";

interface ManagedDownload {
  info: Download;
  abortController?: AbortController;
  childProcess?: ReturnType<typeof spawn>;
  startTime: number;
  lastUpdate: number;
}

class DownloadManager extends EventEmitter {
  private static instance: DownloadManager;
  private downloads: Map<string, ManagedDownload> = new Map();

  private constructor() {
    super();
  }

  static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager();
    }
    return DownloadManager.instance;
  }

  private emitEvent(event: DownloadEvent): void {
    this.emit("download-event", event);
    this.emit(`download-${event.downloadId}`, event);
  }

  private updateProgress(
    downloadId: string,
    downloaded: number,
    total: number
  ): void {
    const managed = this.downloads.get(downloadId);
    if (!managed) return;

    const now = Date.now();
    const elapsed = (now - managed.startTime) / 1000;
    const speed = elapsed > 0 ? downloaded / elapsed : 0;
    const remaining = total - downloaded;
    const eta = speed > 0 ? remaining / speed : 0;

    const progress: DownloadProgress = {
      downloaded,
      total,
      percent: total > 0 ? (downloaded / total) * 100 : 0,
      speed,
      eta,
    };

    managed.info.progress = progress;

    // Throttle events to every 100ms
    if (now - managed.lastUpdate >= 100) {
      managed.lastUpdate = now;
      this.emitEvent({
        type: "progress",
        downloadId,
        timestamp: new Date().toISOString(),
        data: { progress },
      });
    }
  }

  private updateStatus(downloadId: string, status: DownloadStatus, error?: string): void {
    const managed = this.downloads.get(downloadId);
    if (!managed) return;

    managed.info.status = status;
    if (error) {
      managed.info.error = error;
    }
    if (status === "completed" || status === "error" || status === "cancelled") {
      managed.info.completedAt = new Date().toISOString();
    }

    this.emitEvent({
      type: "status",
      downloadId,
      timestamp: new Date().toISOString(),
      data: { status, error },
    });
  }

  async downloadFromUrl(
    name: string,
    url: string
  ): Promise<Download> {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are supported");
      }
    } catch {
      throw new Error("Invalid URL");
    }

    // Extract filename from URL
    const urlPath = parsedUrl.pathname;
    let filename = path.basename(urlPath);
    if (!filename || !filename.endsWith(".gguf")) {
      filename = `${name.replace(/[^a-zA-Z0-9-_]/g, "_")}.gguf`;
    }

    const downloadId = uuidv4();
    const destPath = modelRegistry.getModelPath(filename);

    const download: Download = {
      id: downloadId,
      name,
      filename,
      source: { type: "url", url },
      status: "pending",
      progress: { downloaded: 0, total: 0, percent: 0 },
      startedAt: new Date().toISOString(),
    };

    const abortController = new AbortController();
    const managed: ManagedDownload = {
      info: download,
      abortController,
      startTime: Date.now(),
      lastUpdate: Date.now(),
    };

    this.downloads.set(downloadId, managed);
    this.updateStatus(downloadId, "downloading");

    // Start download in background
    this.performUrlDownload(downloadId, url, destPath, abortController.signal)
      .then(() => {
        // Register the model
        const model = modelRegistry.register(
          name,
          filename,
          managed.info.progress.total,
          { type: "url", url }
        );

        this.updateStatus(downloadId, "completed");
        this.emitEvent({
          type: "complete",
          downloadId,
          timestamp: new Date().toISOString(),
          data: { modelId: model.id },
        });
      })
      .catch((error) => {
        // Clean up partial file
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
        } catch {}

        if (error.name === "AbortError") {
          this.updateStatus(downloadId, "cancelled");
        } else {
          this.updateStatus(downloadId, "error", error.message);
        }
      });

    return download;
  }

  private async performUrlDownload(
    downloadId: string,
    url: string,
    destPath: string,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10
    );

    if (!response.body) {
      throw new Error("No response body");
    }

    const managed = this.downloads.get(downloadId);
    if (managed) {
      managed.info.progress.total = contentLength;
    }

    let downloaded = 0;
    const writeStream = fs.createWriteStream(destPath);

    // Convert web ReadableStream to Node.js Readable
    const reader = response.body.getReader();
    const nodeReadable = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            downloaded += value.length;
            const dm = DownloadManager.getInstance();
            dm.updateProgress(downloadId, downloaded, contentLength);
            this.push(Buffer.from(value));
          }
        } catch (error) {
          this.destroy(error as Error);
        }
      },
    });

    signal.addEventListener("abort", () => {
      reader.cancel();
      nodeReadable.destroy();
      writeStream.destroy();
    });

    await pipeline(nodeReadable, writeStream);
  }

  async downloadFromS3(
    name: string,
    bucket: string,
    key: string
  ): Promise<Download> {
    // Dynamically import AWS SDK
    const { S3Client, GetObjectCommand, HeadObjectCommand } = await import(
      "@aws-sdk/client-s3"
    );

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS credentials not configured");
    }

    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Get file size first
    const headCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const headResponse = await s3Client.send(headCommand);
    const contentLength = headResponse.ContentLength || 0;

    // Extract filename from key
    let filename = path.basename(key);
    if (!filename.endsWith(".gguf")) {
      filename = `${name.replace(/[^a-zA-Z0-9-_]/g, "_")}.gguf`;
    }

    const downloadId = uuidv4();
    const destPath = modelRegistry.getModelPath(filename);

    const download: Download = {
      id: downloadId,
      name,
      filename,
      source: { type: "s3", bucket, key },
      status: "pending",
      progress: { downloaded: 0, total: contentLength, percent: 0 },
      startedAt: new Date().toISOString(),
    };

    const abortController = new AbortController();
    const managed: ManagedDownload = {
      info: download,
      abortController,
      startTime: Date.now(),
      lastUpdate: Date.now(),
    };

    this.downloads.set(downloadId, managed);
    this.updateStatus(downloadId, "downloading");

    // Start download in background
    this.performS3Download(
      downloadId,
      s3Client,
      bucket,
      key,
      destPath,
      contentLength,
      abortController.signal
    )
      .then(() => {
        const model = modelRegistry.register(name, filename, contentLength, {
          type: "s3",
          bucket,
          key,
        });

        this.updateStatus(downloadId, "completed");
        this.emitEvent({
          type: "complete",
          downloadId,
          timestamp: new Date().toISOString(),
          data: { modelId: model.id },
        });
      })
      .catch((error) => {
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
        } catch {}

        if (error.name === "AbortError") {
          this.updateStatus(downloadId, "cancelled");
        } else {
          this.updateStatus(downloadId, "error", error.message);
        }
      });

    return download;
  }

  private async performS3Download(
    downloadId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s3Client: any,
    bucket: string,
    key: string,
    destPath: string,
    contentLength: number,
    signal: AbortSignal
  ): Promise<void> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command, { abortSignal: signal });

    if (!response.Body) {
      throw new Error("No response body from S3");
    }

    let downloaded = 0;
    const writeStream = fs.createWriteStream(destPath);

    // S3 SDK v3 returns a web ReadableStream
    const body = response.Body as ReadableStream;
    const reader = body.getReader();

    const nodeReadable = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            downloaded += value.length;
            const dm = DownloadManager.getInstance();
            dm.updateProgress(downloadId, downloaded, contentLength);
            this.push(Buffer.from(value));
          }
        } catch (error) {
          this.destroy(error as Error);
        }
      },
    });

    signal.addEventListener("abort", () => {
      reader.cancel();
      nodeReadable.destroy();
      writeStream.destroy();
    });

    await pipeline(nodeReadable, writeStream);
  }

  async downloadFromHuggingFace(
    name: string,
    repoId: string,
    hfFilename: string,
    revision?: string
  ): Promise<Download> {
    // Validate inputs
    if (!repoId || !hfFilename) {
      throw new Error("Repository ID and filename are required");
    }

    // Sanitize filename for local storage
    const localFilename = hfFilename.endsWith(".gguf")
      ? hfFilename
      : `${name.replace(/[^a-zA-Z0-9-_]/g, "_")}.gguf`;

    const downloadId = uuidv4();
    const destPath = modelRegistry.getModelPath(localFilename);

    const download: Download = {
      id: downloadId,
      name,
      filename: localFilename,
      source: { type: "huggingface", repoId, filename: hfFilename, revision },
      status: "pending",
      progress: { downloaded: 0, total: 0, percent: 0 },
      startedAt: new Date().toISOString(),
    };

    const managed: ManagedDownload = {
      info: download,
      startTime: Date.now(),
      lastUpdate: Date.now(),
    };

    this.downloads.set(downloadId, managed);
    this.updateStatus(downloadId, "downloading");

    // Start download in background using hf CLI
    this.performHuggingFaceDownload(downloadId, repoId, hfFilename, destPath, revision)
      .then((fileSize) => {
        const model = modelRegistry.register(name, localFilename, fileSize, {
          type: "huggingface",
          repoId,
          filename: hfFilename,
          revision,
        });

        this.updateStatus(downloadId, "completed");
        this.emitEvent({
          type: "complete",
          downloadId,
          timestamp: new Date().toISOString(),
          data: { modelId: model.id },
        });
      })
      .catch((error) => {
        // Clean up partial file
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
        } catch {}

        if (error.message === "Download cancelled") {
          this.updateStatus(downloadId, "cancelled");
        } else {
          this.updateStatus(downloadId, "error", error.message);
        }
      });

    return download;
  }

  private performHuggingFaceDownload(
    downloadId: string,
    repoId: string,
    hfFilename: string,
    destPath: string,
    revision?: string
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const managed = this.downloads.get(downloadId);
      if (!managed) {
        reject(new Error("Download not found"));
        return;
      }

      // Build hf download command
      // hf download <repo_id> <filename> --local-dir <dir> --local-dir-use-symlinks false
      const args = [
        "download",
        "--local-dir",
        path.dirname(destPath),
        repoId,
        hfFilename,
      ];

      if (revision) {
        args.push("--revision", revision);
      }

      // Check for HF token in environment
      const env = { ...process.env };
      if (process.env.HF_TOKEN) {
        env.HF_TOKEN = process.env.HF_TOKEN;
      }

      const hfProcess = spawn("hf", args, { env });
      managed.childProcess = hfProcess;

      let stderr = "";
      let lastProgressUpdate = Date.now();

      hfProcess.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(`[HF Download ${downloadId}] ${output}`);

        // Parse progress from hf CLI output
        // The hf CLI outputs progress like: "Downloading model.gguf: 45%|████      | 2.5G/5.5G"
        const progressMatch = output.match(/(\d+)%\|.*\|\s*([\d.]+[KMGT]?B?)\s*\/\s*([\d.]+[KMGT]?B?)/i);
        if (progressMatch) {
          const percent = parseInt(progressMatch[1], 10);
          const downloaded = this.parseSize(progressMatch[2]);
          const total = this.parseSize(progressMatch[3]);

          if (Date.now() - lastProgressUpdate >= 100) {
            lastProgressUpdate = Date.now();
            managed.info.progress = {
              downloaded,
              total,
              percent,
              speed: undefined,
              eta: undefined,
            };
            this.emitEvent({
              type: "progress",
              downloadId,
              timestamp: new Date().toISOString(),
              data: { progress: managed.info.progress },
            });
          }
        }
      });

      hfProcess.stderr.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        console.error(`[HF Download ${downloadId}] stderr: ${output}`);

        // hf CLI also outputs progress to stderr sometimes
        const progressMatch = output.match(/(\d+)%\|.*\|\s*([\d.]+[KMGT]?B?)\s*\/\s*([\d.]+[KMGT]?B?)/i);
        if (progressMatch) {
          const percent = parseInt(progressMatch[1], 10);
          const downloaded = this.parseSize(progressMatch[2]);
          const total = this.parseSize(progressMatch[3]);

          if (Date.now() - lastProgressUpdate >= 100) {
            lastProgressUpdate = Date.now();
            managed.info.progress = {
              downloaded,
              total,
              percent,
              speed: undefined,
              eta: undefined,
            };
            this.emitEvent({
              type: "progress",
              downloadId,
              timestamp: new Date().toISOString(),
              data: { progress: managed.info.progress },
            });
          }
        }
      });

      hfProcess.on("close", (code) => {
        managed.childProcess = undefined;

        if (code === 0) {
          // Get the downloaded file - hf downloads to a specific structure
          // The file will be at: <local-dir>/<filename>
          const downloadedPath = path.join(path.dirname(destPath), hfFilename);

          // If the file is in a subdirectory, move it to destPath
          if (downloadedPath !== destPath && fs.existsSync(downloadedPath)) {
            fs.renameSync(downloadedPath, destPath);
          }

          if (fs.existsSync(destPath)) {
            const stats = fs.statSync(destPath);
            resolve(stats.size);
          } else {
            reject(new Error("Downloaded file not found"));
          }
        } else if (code === null) {
          reject(new Error("Download cancelled"));
        } else {
          reject(new Error(`hf download failed with code ${code}: ${stderr}`));
        }
      });

      hfProcess.on("error", (error) => {
        managed.childProcess = undefined;
        reject(new Error(`Failed to spawn hf process: ${error.message}`));
      });
    });
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*([KMGT]?)B?/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      "": 1,
      K: 1024,
      M: 1024 * 1024,
      G: 1024 * 1024 * 1024,
      T: 1024 * 1024 * 1024 * 1024,
    };

    return value * (multipliers[unit] || 1);
  }

  cancel(downloadId: string): boolean {
    const managed = this.downloads.get(downloadId);
    if (!managed) return false;

    if (managed.info.status !== "downloading") {
      return false;
    }

    // Cancel fetch-based downloads
    managed.abortController?.abort();

    // Kill child process for HF downloads
    if (managed.childProcess) {
      managed.childProcess.kill("SIGTERM");
    }

    return true;
  }

  getDownload(downloadId: string): Download | undefined {
    return this.downloads.get(downloadId)?.info;
  }

  getAllDownloads(): Download[] {
    return Array.from(this.downloads.values()).map((m) => m.info);
  }

  getActiveDownloads(): Download[] {
    return this.getAllDownloads().filter((d) => d.status === "downloading");
  }

  subscribe(
    downloadId: string,
    callback: (event: DownloadEvent) => void
  ): () => void {
    const handler = (event: DownloadEvent) => callback(event);
    this.on(`download-${downloadId}`, handler);
    return () => this.off(`download-${downloadId}`, handler);
  }

  subscribeAll(callback: (event: DownloadEvent) => void): () => void {
    const handler = (event: DownloadEvent) => callback(event);
    this.on("download-event", handler);
    return () => this.off("download-event", handler);
  }

  removeDownload(downloadId: string): boolean {
    const managed = this.downloads.get(downloadId);
    if (!managed) return false;

    if (managed.info.status === "downloading") {
      this.cancel(downloadId);
    }

    this.downloads.delete(downloadId);
    return true;
  }
}

export const downloadManager = DownloadManager.getInstance();
