"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Model, VLLMProcess } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

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

export default function DashboardPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [processes, setProcesses] = useState<VLLMProcess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
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
    }

    fetchData();
  }, []);

  const runningProcesses = processes.filter((p) => p.status === "running");
  const totalModelSize = models.reduce((acc, m) => acc + m.size, 0);

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
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your vLLM model management
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Models
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{models.length}</div>
              <p className="text-xs text-muted-foreground">
                {formatBytes(totalModelSize)} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Running Instances
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{runningProcesses.length}</div>
              <p className="text-xs text-muted-foreground">
                {processes.length} total processes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full" size="sm">
                <Link href="/models">Manage Models</Link>
              </Button>
              <Button asChild variant="outline" className="w-full" size="sm">
                <Link href="/processes">View Processes</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Chat</CardTitle>
            </CardHeader>
            <CardContent>
              {runningProcesses.length > 0 ? (
                <Button asChild className="w-full" size="sm">
                  <Link href="/chat">Start Chat</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No running instances. Start a model to begin chatting.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Models</CardTitle>
            </CardHeader>
            <CardContent>
              {models.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No models downloaded yet.{" "}
                  <Link href="/models" className="text-primary hover:underline">
                    Download a model
                  </Link>
                </p>
              ) : (
                <div className="space-y-3">
                  {models.slice(0, 5).map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatBytes(model.size)}
                        </p>
                      </div>
                      <Badge variant="secondary">{model.source.type}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Running Processes</CardTitle>
            </CardHeader>
            <CardContent>
              {processes.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No processes yet.{" "}
                  <Link href="/processes" className="text-primary hover:underline">
                    Start a process
                  </Link>
                </p>
              ) : (
                <div className="space-y-3">
                  {processes.slice(0, 5).map((process) => (
                    <div
                      key={process.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{process.modelName}</p>
                        <p className="text-sm text-muted-foreground">
                          Port {process.port}
                        </p>
                      </div>
                      <Badge
                        className={`${getStatusColor(process.status)} text-white`}
                      >
                        {process.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
