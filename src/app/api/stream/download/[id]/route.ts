import { downloadManager } from "@/lib/download-manager";
import { DownloadEvent } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const download = downloadManager.getDownload(id);

  if (!download) {
    return new Response(JSON.stringify({ error: "Download not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initData = `data: ${JSON.stringify({
        type: "init",
        downloadId: id,
        timestamp: new Date().toISOString(),
        data: {
          status: download.status,
          progress: download.progress,
        },
      })}\n\n`;
      controller.enqueue(encoder.encode(initData));

      // Subscribe to updates
      const unsubscribe = downloadManager.subscribe(id, (event: DownloadEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // Close stream on completion
          if (
            event.type === "complete" ||
            event.data.status === "error" ||
            event.data.status === "cancelled"
          ) {
            unsubscribe();
            controller.close();
          }
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
