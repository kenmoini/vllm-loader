"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Model, VLLMProcess, VLLMConfig, ProcessEvent } from "@/types";
import { useSSE } from "@/hooks/use-sse";

function getStatusColor(status: string): string {
  switch (status) {
    case "running":
      return "bg-green-500";
    case "starting":
      return "bg-yellow-500";
    case "stopping":
      return "bg-orange-500";
    case "stopped":
      return "bg-gray-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

const defaultConfig: Partial<VLLMConfig> = {
  dtype: "auto",
  gpuMemoryUtilization: 0.9,
  tensorParallelSize: 1,
  enforceEager: false,
  trustRemoteCode: false,
};

export default function ProcessesPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [processes, setProcesses] = useState<VLLMProcess[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<VLLMProcess | null>(null);
  const [logs, setLogs] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [config, setConfig] = useState<Partial<VLLMConfig>>(defaultConfig);
  const [isSpawning, setIsSpawning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [modelsRes, processesRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/processes"),
      ]);

      const modelsData = await modelsRes.json();
      const processesData = await processesRes.json();

      setModels(modelsData.models || []);
      setProcesses(processesData.processes || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to process events
  useSSE("/api/stream/processes", {
    onMessage: (data) => {
      const event = data as { type: string; processId?: string; data?: { processes?: VLLMProcess[]; status?: VLLMProcess["status"]; message?: string } };

      if (event.type === "init" && event.data?.processes) {
        setProcesses(event.data.processes);
        return;
      }

      if (event.type === "status" && event.processId) {
        setProcesses((prev) =>
          prev.map((p) =>
            p.id === event.processId
              ? { ...p, status: event.data?.status || p.status }
              : p
          )
        );
      }

      if (event.type === "log" && event.processId && event.data?.message) {
        const processId = event.processId;
        const message = event.data.message;
        setLogs((prev) => {
          const newLogs = new Map(prev);
          const processLogs = newLogs.get(processId) || [];
          newLogs.set(processId, [...processLogs, message].slice(-500));
          return newLogs;
        });
      }
    },
  });

  const handleSpawn = async () => {
    if (!selectedModelId) {
      toast.error("Please select a model");
      return;
    }

    setIsSpawning(true);

    try {
      const response = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModelId,
          config,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to spawn process");
      }

      const process = await response.json();
      setProcesses((prev) => [...prev, process]);
      setSpawnDialogOpen(false);
      setSelectedModelId("");
      setConfig(defaultConfig);
      toast.success("Process started!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to spawn process");
    } finally {
      setIsSpawning(false);
    }
  };

  const handleStop = async (processId: string) => {
    try {
      const response = await fetch(`/api/processes/${processId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to stop process");
      }

      toast.success("Process stopping...");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to stop process");
    }
  };

  const handleRemove = async (processId: string) => {
    try {
      const response = await fetch(`/api/processes/${processId}?action=remove`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to remove process");
      }

      setProcesses((prev) => prev.filter((p) => p.id !== processId));
      toast.success("Process removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove process");
    }
  };

  const handleViewLogs = (process: VLLMProcess) => {
    setSelectedProcess(process);
    setLogsDialogOpen(true);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Processes</h1>
            <p className="text-muted-foreground">
              Manage running vLLM instances
            </p>
          </div>
          <Dialog open={spawnDialogOpen} onOpenChange={setSpawnDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={models.length === 0}>Start Process</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Start vLLM Process</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={selectedModelId}
                    onValueChange={setSelectedModelId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Type</Label>
                    <Select
                      value={config.dtype || "auto"}
                      onValueChange={(v) =>
                        setConfig((prev) => ({ ...prev, dtype: v as VLLMConfig["dtype"] }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="float16">Float16</SelectItem>
                        <SelectItem value="bfloat16">BFloat16</SelectItem>
                        <SelectItem value="float32">Float32</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>GPU Memory Utilization</Label>
                    <Input
                      type="number"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={config.gpuMemoryUtilization || 0.9}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          gpuMemoryUtilization: parseFloat(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tensor Parallel Size</Label>
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={config.tensorParallelSize || 1}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          tensorParallelSize: parseInt(e.target.value),
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Max Model Length</Label>
                    <Input
                      type="number"
                      min={512}
                      placeholder="Auto"
                      value={config.maxModelLen || ""}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          maxModelLen: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tokenizer (optional)</Label>
                  <Input
                    placeholder="HuggingFace tokenizer path"
                    value={config.tokenizer || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        tokenizer: e.target.value || undefined,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Served Model Name (optional)</Label>
                  <Input
                    placeholder="Override model name in API"
                    value={config.servedModelName || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        servedModelName: e.target.value || undefined,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.enforceEager || false}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          enforceEager: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm">Enforce Eager</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.trustRemoteCode || false}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          trustRemoteCode: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm">Trust Remote Code</span>
                  </label>
                </div>

                <Button
                  onClick={handleSpawn}
                  disabled={isSpawning || !selectedModelId}
                  className="w-full"
                >
                  {isSpawning ? "Starting..." : "Start Process"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {processes.map((process) => (
            <Card key={process.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{process.modelName}</CardTitle>
                  <Badge
                    className={`${getStatusColor(process.status)} text-white`}
                  >
                    {process.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Port:</span>
                    <span>{process.port}</span>
                    <span className="text-muted-foreground">PID:</span>
                    <span>{process.pid || "N/A"}</span>
                    <span className="text-muted-foreground">GPU Memory:</span>
                    <span>
                      {(process.config.gpuMemoryUtilization || 0.9) * 100}%
                    </span>
                    <span className="text-muted-foreground">Tensor Parallel:</span>
                    <span>{process.config.tensorParallelSize || 1}</span>
                  </div>

                  {process.error && (
                    <p className="text-sm text-red-500 mt-2">{process.error}</p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewLogs(process)}
                    >
                      View Logs
                    </Button>

                    {(process.status === "running" ||
                      process.status === "starting") && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleStop(process.id)}
                      >
                        Stop
                      </Button>
                    )}

                    {(process.status === "stopped" ||
                      process.status === "error") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Process</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove this process from the list?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemove(process.id)}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {processes.length === 0 && (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">
                No processes yet. Click &quot;Start Process&quot; to launch a vLLM
                instance.
              </p>
            </div>
          )}
        </div>

        {/* Logs Dialog */}
        <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
          <DialogContent className="max-w-3xl h-[70vh]">
            <DialogHeader>
              <DialogTitle>
                Logs: {selectedProcess?.modelName}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-full">
              <pre className="text-xs font-mono bg-muted p-4 rounded-lg whitespace-pre-wrap">
                {(logs.get(selectedProcess?.id || "") || []).join("\n") ||
                  "No logs available"}
              </pre>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
