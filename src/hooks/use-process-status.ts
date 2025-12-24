"use client";

import { useCallback, useState } from "react";
import { useSSE } from "./use-sse";
import { VLLMProcess, ProcessStatus } from "@/types";

interface ProcessState {
  processes: VLLMProcess[];
  logs: Map<string, string[]>;
}

interface SSEEvent {
  type: string;
  processId?: string;
  data?: {
    processes?: VLLMProcess[];
    logs?: string[];
    status?: ProcessStatus;
    message?: string;
  };
}

export function useProcessStatus() {
  const [state, setState] = useState<ProcessState>({
    processes: [],
    logs: new Map(),
  });

  const handleMessage = useCallback((data: unknown) => {
    const event = data as SSEEvent;

    if (event.type === "init" && event.data?.processes) {
      setState((prev) => ({
        ...prev,
        processes: event.data!.processes!,
      }));
      return;
    }

    if (event.type === "status" && event.processId) {
      setState((prev) => ({
        ...prev,
        processes: prev.processes.map((p) =>
          p.id === event.processId
            ? { ...p, status: event.data?.status as ProcessStatus }
            : p
        ),
      }));
    }

    if (event.type === "log" && event.processId && event.data?.message) {
      const processId = event.processId;
      const message = event.data.message;
      setState((prev) => {
        const newLogs = new Map(prev.logs);
        const processLogs = newLogs.get(processId) || [];
        newLogs.set(processId, [...processLogs, message].slice(-500));
        return { ...prev, logs: newLogs };
      });
    }
  }, []);

  const { isConnected, error, reconnect } = useSSE(
    "/api/stream/processes",
    {
      onMessage: handleMessage,
      autoReconnect: true,
    }
  );

  const getProcessLogs = useCallback(
    (processId: string) => {
      return state.logs.get(processId) || [];
    },
    [state.logs]
  );

  const refetch = useCallback(async () => {
    try {
      const response = await fetch("/api/processes");
      const data = await response.json();
      setState((prev) => ({
        ...prev,
        processes: data.processes,
      }));
    } catch (error) {
      console.error("Failed to fetch processes:", error);
    }
  }, []);

  return {
    processes: state.processes,
    isConnected,
    error,
    reconnect,
    refetch,
    getProcessLogs,
  };
}
