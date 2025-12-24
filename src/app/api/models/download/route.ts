import { NextResponse } from "next/server";
import { downloadManager } from "@/lib/download-manager";
import { StartDownloadRequest } from "@/types";

export async function GET() {
  try {
    const downloads = downloadManager.getAllDownloads();
    return NextResponse.json({ downloads });
  } catch (error) {
    console.error("Failed to get downloads:", error);
    return NextResponse.json(
      { error: "Failed to get downloads" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: StartDownloadRequest = await request.json();

    if (!body.name || !body.source) {
      return NextResponse.json(
        { error: "Name and source are required" },
        { status: 400 }
      );
    }

    let download;

    if (body.source.type === "url") {
      if (!body.source.url) {
        return NextResponse.json(
          { error: "URL is required for URL downloads" },
          { status: 400 }
        );
      }
      download = await downloadManager.downloadFromUrl(
        body.name,
        body.source.url
      );
    } else if (body.source.type === "s3") {
      if (!body.source.bucket || !body.source.key) {
        return NextResponse.json(
          { error: "Bucket and key are required for S3 downloads" },
          { status: 400 }
        );
      }
      download = await downloadManager.downloadFromS3(
        body.name,
        body.source.bucket,
        body.source.key
      );
    } else if (body.source.type === "huggingface") {
      if (!body.source.repoId || !body.source.filename) {
        return NextResponse.json(
          { error: "Repository ID and filename are required for Hugging Face downloads" },
          { status: 400 }
        );
      }
      download = await downloadManager.downloadFromHuggingFace(
        body.name,
        body.source.repoId,
        body.source.filename,
        body.source.revision
      );
    } else {
      return NextResponse.json(
        { error: "Invalid source type" },
        { status: 400 }
      );
    }

    return NextResponse.json(download, { status: 201 });
  } catch (error) {
    console.error("Failed to start download:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start download" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Download ID is required" },
        { status: 400 }
      );
    }

    const cancelled = downloadManager.cancel(id);

    if (!cancelled) {
      return NextResponse.json(
        { error: "Download not found or already completed" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to cancel download:", error);
    return NextResponse.json(
      { error: "Failed to cancel download" },
      { status: 500 }
    );
  }
}
