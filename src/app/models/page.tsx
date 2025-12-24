"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Model, Download, DownloadProgress, DownloadStatus } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

interface SSEDownloadEvent {
  type: string;
  downloadId?: string;
  timestamp?: string;
  data?: {
    downloads?: Download[];
    progress?: DownloadProgress;
    status?: DownloadStatus;
    modelId?: string;
    error?: string;
  };
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"url" | "s3" | "huggingface">("url");
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    bucket: "",
    key: "",
    repoId: "",
    hfFilename: "",
    revision: "",
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch("/api/models");
      const data = await response.json();
      setModels(data.models || []);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [modelsRes, downloadsRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/models/download"),
      ]);

      const modelsData = await modelsRes.json();
      const downloadsData = await downloadsRes.json();

      setModels(modelsData.models || []);
      setDownloads(downloadsData.downloads || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up SSE connection for download updates
  useEffect(() => {
    const eventSource = new EventSource("/api/stream/downloads");
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: SSEDownloadEvent = JSON.parse(event.data);

        // Handle initial state
        if (data.type === "init" && data.data?.downloads) {
          setDownloads(data.data.downloads);
          return;
        }

        // Handle progress updates
        if (data.type === "progress" && data.downloadId && data.data?.progress) {
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.downloadId
                ? { ...d, progress: data.data!.progress! }
                : d
            )
          );
        }

        // Handle status updates
        if (data.type === "status" && data.downloadId && data.data?.status) {
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.downloadId
                ? { ...d, status: data.data!.status! }
                : d
            )
          );
        }

        // Handle completion
        if (data.type === "complete" && data.downloadId) {
          toast.success("Download completed!");
          // Refresh models list to show the new model
          fetchModels();
          // Update download status
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.downloadId
                ? { ...d, status: "completed" as DownloadStatus }
                : d
            )
          );
        }

        // Handle errors
        if (data.type === "error" && data.downloadId) {
          toast.error(`Download failed: ${data.data?.error || "Unknown error"}`);
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.downloadId
                ? { ...d, status: "error" as DownloadStatus, error: data.data?.error }
                : d
            )
          );
        }
      } catch (e) {
        // Ignore parse errors (keepalive comments, etc.)
      }
    };

    eventSource.onerror = () => {
      console.error("SSE connection error, will reconnect...");
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [fetchModels]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownload = async () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    if (sourceType === "url" && !formData.url) {
      toast.error("URL is required");
      return;
    }

    if (sourceType === "s3" && (!formData.bucket || !formData.key)) {
      toast.error("Bucket and key are required");
      return;
    }

    if (sourceType === "huggingface" && (!formData.repoId || !formData.hfFilename)) {
      toast.error("Repository ID and filename are required");
      return;
    }

    setIsDownloading(true);

    // Build source object based on type
    let source;
    if (sourceType === "url") {
      source = { type: "url" as const, url: formData.url };
    } else if (sourceType === "s3") {
      source = { type: "s3" as const, bucket: formData.bucket, key: formData.key };
    } else {
      source = {
        type: "huggingface" as const,
        repoId: formData.repoId,
        filename: formData.hfFilename,
        revision: formData.revision || undefined,
      };
    }

    try {
      const response = await fetch("/api/models/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          source,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start download");
      }

      const download = await response.json();
      setDownloads((prev) => [...prev, download]);
      setDownloadDialogOpen(false);
      setFormData({ name: "", url: "", bucket: "", key: "", repoId: "", hfFilename: "", revision: "" });
      toast.success("Download started!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start download");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async (modelId: string) => {
    try {
      const response = await fetch(`/api/models/${modelId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete model");
      }

      setModels((prev) => prev.filter((m) => m.id !== modelId));
      toast.success("Model deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete model");
    }
  };

  const handleCancelDownload = async (downloadId: string) => {
    try {
      const response = await fetch(`/api/models/download?id=${downloadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel download");
      }

      setDownloads((prev) =>
        prev.map((d) =>
          d.id === downloadId ? { ...d, status: "cancelled" as const } : d
        )
      );
      toast.success("Download cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel download");
    }
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

  const activeDownloads = downloads.filter((d) => d.status === "downloading");
  const pendingDownloads = downloads.filter((d) => d.status === "pending");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Models</h1>
            <p className="text-muted-foreground">
              Manage your GGUF model files
            </p>
          </div>
          <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
            <DialogTrigger asChild>
              <Button>Download Model</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Download Model</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Model Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Llama-3.2-1B"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Source Type</Label>
                  <Select
                    value={sourceType}
                    onValueChange={(v) => setSourceType(v as "url" | "s3" | "huggingface")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="s3">S3 Bucket</SelectItem>
                      <SelectItem value="huggingface">Hugging Face</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {sourceType === "url" && (
                  <div className="space-y-2">
                    <Label htmlFor="url">Download URL</Label>
                    <Input
                      id="url"
                      placeholder="https://example.com/model.gguf"
                      value={formData.url}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, url: e.target.value }))
                      }
                    />
                  </div>
                )}

                {sourceType === "s3" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bucket">S3 Bucket</Label>
                      <Input
                        id="bucket"
                        placeholder="my-models-bucket"
                        value={formData.bucket}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            bucket: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="key">S3 Key</Label>
                      <Input
                        id="key"
                        placeholder="models/llama-3.2-1b.gguf"
                        value={formData.key}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, key: e.target.value }))
                        }
                      />
                    </div>
                  </>
                )}

                {sourceType === "huggingface" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="repoId">Repository ID</Label>
                      <Input
                        id="repoId"
                        placeholder="TheBloke/Llama-2-7B-GGUF"
                        value={formData.repoId}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            repoId: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hfFilename">Filename</Label>
                      <Input
                        id="hfFilename"
                        placeholder="llama-2-7b.Q4_K_M.gguf"
                        value={formData.hfFilename}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            hfFilename: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="revision">Revision (optional)</Label>
                      <Input
                        id="revision"
                        placeholder="main"
                        value={formData.revision}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            revision: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                )}

                <Button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-full"
                >
                  {isDownloading ? "Starting..." : "Start Download"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {(activeDownloads.length > 0 || pendingDownloads.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Active Downloads
                {activeDownloads.length > 0 && (
                  <Badge variant="secondary" className="animate-pulse">
                    {activeDownloads.length} in progress
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[...activeDownloads, ...pendingDownloads].map((download) => (
                <div key={download.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{download.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {download.status === "pending" ? (
                          "Starting..."
                        ) : (
                          <>
                            {formatBytes(download.progress.downloaded)} /{" "}
                            {download.progress.total > 0
                              ? formatBytes(download.progress.total)
                              : "Unknown"}
                            {download.progress.speed !== undefined &&
                              download.progress.speed > 0 &&
                              ` - ${formatSpeed(download.progress.speed)}`}
                            {download.progress.eta !== undefined &&
                              download.progress.eta > 0 &&
                              ` - ${formatEta(download.progress.eta)} remaining`}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          download.status === "downloading"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {download.status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelDownload(download.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                  <Progress
                    value={download.progress.percent}
                    className="h-2"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <Card key={model.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{model.name}</CardTitle>
                  <Badge variant="secondary">{model.source.type}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {model.filename}
                  </p>
                  <p className="text-sm">Size: {formatBytes(model.size)}</p>
                  <p className="text-sm text-muted-foreground">
                    Downloaded:{" "}
                    {new Date(model.downloadedAt).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2 pt-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Model</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {model.name}? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(model.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {models.length === 0 && (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">
                No models downloaded yet. Click &quot;Download Model&quot; to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
