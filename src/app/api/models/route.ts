import { NextResponse } from "next/server";
import { modelRegistry } from "@/lib/model-registry";

export async function GET() {
  try {
    const models = modelRegistry.getAllModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error("Failed to get models:", error);
    return NextResponse.json(
      { error: "Failed to get models" },
      { status: 500 }
    );
  }
}
