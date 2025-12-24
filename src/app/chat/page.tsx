"use client";

import { useEffect, useState, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { VLLMProcess, ChatMessage } from "@/types";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  const [processes, setProcesses] = useState<VLLMProcess[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string>("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading: isSending,
    sendMessage,
    cancelGeneration,
    clearMessages,
  } = useChat({
    processId: selectedProcessId,
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    async function fetchProcesses() {
      try {
        const response = await fetch("/api/processes");
        const data = await response.json();
        const runningProcesses = (data.processes || []).filter(
          (p: VLLMProcess) => p.status === "running"
        );
        setProcesses(runningProcesses);

        if (runningProcesses.length > 0 && !selectedProcessId) {
          setSelectedProcessId(runningProcesses[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch processes:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProcesses();
    const interval = setInterval(fetchProcesses, 10000);
    return () => clearInterval(interval);
  }, [selectedProcessId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedProcessId) return;

    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
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

  if (processes.length === 0) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <h2 className="text-2xl font-bold">No Running Models</h2>
          <p className="text-muted-foreground text-center max-w-md">
            You need to have at least one running vLLM instance to start
            chatting. Go to the Processes page to start a model.
          </p>
          <Button asChild>
            <a href="/processes">Go to Processes</a>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const selectedProcess = processes.find((p) => p.id === selectedProcessId);

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Chat</h1>
            <Select
              value={selectedProcessId}
              onValueChange={(value) => {
                setSelectedProcessId(value);
                clearMessages();
              }}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {processes.map((process) => (
                  <SelectItem key={process.id} value={process.id}>
                    {process.modelName} (:{process.port})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={clearMessages}>
            Clear Chat
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 py-4" ref={scrollRef}>
          <div className="space-y-4 pr-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <p>Start a conversation with {selectedProcess?.modelName}</p>
                <p className="text-sm mt-2">
                  Running on port {selectedProcess?.port}
                </p>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {isSending && messages.length > 0 && !messages[messages.length - 1].content && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span>Generating...</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={handleSubmit} className="pt-4 border-t">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="resize-none"
              rows={3}
              disabled={isSending}
            />
            <div className="flex flex-col gap-2">
              {isSending ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={cancelGeneration}
                >
                  Stop
                </Button>
              ) : (
                <Button type="submit" disabled={!input.trim()}>
                  Send
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </AppLayout>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground italic">
        <span className="font-medium">System: </span>
        {message.content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback>{isUser ? "U" : "AI"}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "rounded-lg p-3 max-w-[80%]",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
}
