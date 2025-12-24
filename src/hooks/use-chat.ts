"use client";

import { useState, useCallback, useRef } from "react";
import { nanoid } from "nanoid";
import { ChatMessage, MessageRole } from "@/types";

interface UseChatOptions {
  processId: string;
  onError?: (error: Error) => void;
}

export function useChat({ processId, onError }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((role: MessageRole, content: string) => {
    const message: ChatMessage = {
      id: nanoid(),
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  const updateLastMessage = useCallback((content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const lastIndex = prev.length - 1;
      return [
        ...prev.slice(0, lastIndex),
        { ...prev[lastIndex], content },
      ];
    });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !processId) return;

      // Add user message
      addMessage("user", content);

      // Add placeholder for assistant response
      const assistantMessage = addMessage("assistant", "");

      setIsLoading(true);
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processId,
            messages: [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content },
            ],
            stream: true,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to send message");
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                accumulatedContent += delta;
                updateLastMessage(accumulatedContent);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        // Update final message
        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          return [
            ...prev.slice(0, lastIndex),
            { ...prev[lastIndex], content: accumulatedContent },
          ];
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          // User cancelled
          return;
        }

        // Remove the empty assistant message
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));

        const err = error instanceof Error ? error : new Error("Unknown error");
        onError?.(err);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [processId, messages, addMessage, updateLastMessage, onError]
  );

  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const setSystemMessage = useCallback((content: string) => {
    setMessages((prev) => {
      const filtered = prev.filter((m) => m.role !== "system");
      if (content) {
        return [
          {
            id: nanoid(),
            role: "system" as MessageRole,
            content,
            timestamp: new Date().toISOString(),
          },
          ...filtered,
        ];
      }
      return filtered;
    });
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    cancelGeneration,
    clearMessages,
    setSystemMessage,
  };
}
