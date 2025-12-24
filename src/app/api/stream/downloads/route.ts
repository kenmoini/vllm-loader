import { downloadManager } from "@/lib/download-manager";
import { DownloadEvent } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const downloads = downloadManager.getAllDownloads();
      const initData = `data: ${JSON.stringify({
        type: "init",
        timestamp: new Date().toISOString(),
        data: { downloads },
      })}\n\n`;
      controller.enqueue(encoder.encode(initData));

      // Subscribe to all download updates
      const unsubscribe = downloadManager.subscribeAll((event: DownloadEvent) => {
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
