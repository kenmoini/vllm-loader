import { NextResponse } from "next/server";
import { modelRegistry } from "@/lib/model-registry";
import { processManager } from "@/lib/process-manager";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const model = modelRegistry.getModel(id);

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json(model);
  } catch (error) {
    console.error("Failed to get model:", error);
    return NextResponse.json(
      { error: "Failed to get model" },
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
    const model = modelRegistry.getModel(id);

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Check if model is in use by any running process
    const runningProcesses = processManager.getRunningProcesses();
    const inUse = runningProcesses.some((p) => p.modelId === id);

    if (inUse) {
      return NextResponse.json(
        { error: "Model is in use by a running process" },
        { status: 409 }
      );
    }

    const deleted = modelRegistry.deleteModel(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete model" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete model:", error);
    return NextResponse.json(
      { error: "Failed to delete model" },
      { status: 500 }
    );
  }
}
