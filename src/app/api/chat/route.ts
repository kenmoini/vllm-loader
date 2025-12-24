import { NextResponse } from "next/server";
import { processManager } from "@/lib/process-manager";
import { ChatRequest } from "@/types";

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.processId) {
      return NextResponse.json(
        { error: "Process ID is required" },
        { status: 400 }
      );
    }

    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    const process = processManager.getProcess(body.processId);

    if (!process) {
      return NextResponse.json(
        { error: "Process not found" },
        { status: 404 }
      );
    }

    if (process.status !== "running") {
      return NextResponse.json(
        { error: "Process is not running" },
        { status: 400 }
      );
    }

    const vllmUrl = `http://127.0.0.1:${process.port}/v1/chat/completions`;

    const vllmRequest = {
      model: process.config.servedModelName || process.modelName,
      messages: body.messages,
      stream: body.stream ?? true,
      temperature: body.temperature,
      max_tokens: body.maxTokens,
      top_p: body.topP,
      frequency_penalty: body.frequencyPenalty,
      presence_penalty: body.presencePenalty,
    };

    // Remove undefined values
    const cleanedRequest = Object.fromEntries(
      Object.entries(vllmRequest).filter(([, v]) => v !== undefined)
    );

    const vllmResponse = await fetch(vllmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.config.apiKey && {
          Authorization: `Bearer ${process.config.apiKey}`,
        }),
      },
      body: JSON.stringify(cleanedRequest),
    });

    if (!vllmResponse.ok) {
      const error = await vllmResponse.text();
      console.error("vLLM error:", error);
      return NextResponse.json(
        { error: `vLLM error: ${vllmResponse.statusText}` },
        { status: vllmResponse.status }
      );
    }

    // Stream the response back
    if (body.stream !== false && vllmResponse.body) {
      return new Response(vllmResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response
    const data = await vllmResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to process chat request:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process chat request" },
      { status: 500 }
    );
  }
}
