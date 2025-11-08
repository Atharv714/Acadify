import { NextRequest } from "next/server";
import { getContainerClient } from "@/lib/azure/blob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    // Await params to satisfy Next.js 15 requirement even if we don't use the value
    try { await params; } catch {}
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  const asInline = (searchParams.get("inline") || "").toLowerCase() === "1" || (searchParams.get("inline") || "").toLowerCase() === "true";
    if (!name) {
      return new Response(JSON.stringify({ error: "name query param required" }), { status: 400 });
    }

    const container = getContainerClient();
    const blob = container.getBlobClient(name);
    const exists = await blob.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }

    // Prefer original filename if present in metadata
    let originalName: string | undefined;
    try {
      const props = await blob.getProperties();
      const meta = (props.metadata || {}) as Record<string, string | undefined>;
      originalName = meta.originalname || meta.originalName;
    } catch {}

    const download = await blob.download();
    const headers = new Headers();
    const contentType = download.contentType || download._response.headers.get("content-type") || "application/octet-stream";
    headers.set("Content-Type", contentType);
    const dispName = originalName || name.split("/").pop() || "file";
    if (asInline) {
      headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(dispName)}`);
    } else {
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(dispName)}`);
    }

    // Node stream to web stream
    const nodeStream = download.readableStreamBody!;
    const readable = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        try { (nodeStream as any).destroy?.(); } catch {}
      },
    });

    return new Response(readable as any, { headers });
  } catch (e) {
    console.error("download attachment error", e);
    return new Response(JSON.stringify({ error: "Failed to download attachment" }), { status: 500 });
  }
}
