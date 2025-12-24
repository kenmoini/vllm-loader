import { NextResponse } from "next/server";
import { processManager } from "@/lib/process-manager";
import { modelRegistry } from "@/lib/model-registry";
import { SpawnProcessRequest } from "@/types";
import { validateConfig } from "@/lib/vllm-config";

export async function GET() {
  try {
    const processes = processManager.getAllProcesses();
    return NextResponse.json({ processes });
  } catch (error) {
    console.error("Failed to get processes:", error);
    return NextResponse.json(
      { error: "Failed to get processes" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: SpawnProcessRequest = await request.json();

    if (!body.modelId) {
      return NextResponse.json(
        { error: "Model ID is required" },
        { status: 400 }
      );
    }

    const model = modelRegistry.getModel(body.modelId);

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Validate config if provided
    if (body.config) {
      const errors = validateConfig(body.config);
      if (errors.length > 0) {
        return NextResponse.json(
          { error: "Invalid configuration", details: errors },
          { status: 400 }
        );
      }
    }

    const process = await processManager.spawn(
      model.id,
      model.name,
      model.path,
      body.config
    );

    return NextResponse.json(process, { status: 201 });
  } catch (error) {
    console.error("Failed to spawn process:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to spawn process" },
      { status: 500 }
    );
  }
}
