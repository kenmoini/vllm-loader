import { processManager } from "@/lib/process-manager";
import { ProcessEvent } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const process = processManager.getProcess(id);

  if (!process) {
    return new Response(JSON.stringify({ error: "Process not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initialLogs = processManager.getLogs(id);
      const initData = `data: ${JSON.stringify({
        type: "init",
        processId: id,
        timestamp: new Date().toISOString(),
        data: {
          status: process.status,
          logs: initialLogs,
        },
      })}\n\n`;
      controller.enqueue(encoder.encode(initData));

      // Subscribe to updates
      const unsubscribe = processManager.subscribe(id, (event: ProcessEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream closed
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
