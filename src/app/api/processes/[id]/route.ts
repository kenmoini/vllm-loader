import { NextResponse } from "next/server";
import { processManager } from "@/lib/process-manager";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const process = processManager.getProcess(id);

    if (!process) {
      return NextResponse.json({ error: "Process not found" }, { status: 404 });
    }

    const logs = processManager.getLogs(id, 100);
    return NextResponse.json({ ...process, logs });
  } catch (error) {
    console.error("Failed to get process:", error);
    return NextResponse.json(
      { error: "Failed to get process" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const process = processManager.getProcess(id);

    if (!process) {
      return NextResponse.json({ error: "Process not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    await processManager.kill(id, force);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to kill process:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to kill process" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "restart") {
      const process = await processManager.restart(id);
      return NextResponse.json(process);
    }

    if (action === "health") {
      const healthy = await processManager.checkHealth(id);
      return NextResponse.json({ healthy });
    }

    if (action === "remove") {
      const removed = processManager.removeProcess(id);
      if (!removed) {
        return NextResponse.json(
          { error: "Process not found or still running" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Failed to perform action:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to perform action" },
      { status: 500 }
    );
  }
}
