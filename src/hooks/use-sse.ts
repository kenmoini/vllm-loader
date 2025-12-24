"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseSSEOptions {
  onMessage?: (data: unknown) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useSSE(url: string | null, options: UseSSEOptions = {}) {
  const {
    onMessage,
    onError,
    onOpen,
    onClose,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!url) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      onOpen?.();
    };

    eventSource.onmessage = (event) => {
      try {
        // Skip keepalive comments
        if (event.data.startsWith(":")) return;

        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (e) {
        console.error("Failed to parse SSE message:", e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      const err = new Error("SSE connection error");
      setError(err);
      onError?.(err);

      eventSource.close();
      eventSourceRef.current = null;

      if (autoReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [url, onMessage, onError, onOpen, autoReconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      onClose?.();
    }
  }, [onClose]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    error,
    reconnect: connect,
    disconnect,
  };
}
