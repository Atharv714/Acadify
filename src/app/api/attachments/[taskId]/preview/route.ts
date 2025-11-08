import { NextRequest } from "next/server";
import { getContainerClient } from "@/lib/azure/blob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    // Satisfy Next 15 param behavior
    try { await params; } catch {}

    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    if (!name) return new Response(JSON.stringify({ error: "name query param required" }), { status: 400 });

    const container = getContainerClient();
    const blob = container.getBlobClient(name);
    const exists = await blob.exists();
    if (!exists) return new Response("Not found", { status: 404 });

    const props = await blob.getProperties();
    const size = Number(props.contentLength || 0);
    const contentType = props.contentType || "application/octet-stream";
    const meta = (props.metadata || {}) as Record<string, string | undefined>;
    const originalName = meta.originalname || meta.originalName || name.split("/").pop() || "file";

    const range = req.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      // Parse the byte range
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      let start = startStr ? parseInt(startStr, 10) : 0;
      let end = endStr ? parseInt(endStr, 10) : size - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= size) end = size - 1;
      if (start > end || start >= size) {
        return new Response(null, {
          status: 416, // Range Not Satisfiable
          headers: new Headers({
            "Content-Range": `bytes */${size}`,
          }),
        });
      }
      const chunkSize = end - start + 1;
      const dl = await blob.download(start, chunkSize);
      const nodeStream = dl.readableStreamBody!;
      const readable = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk) => controller.enqueue(chunk));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err) => controller.error(err));
        },
        cancel() { try { (nodeStream as any).destroy?.(); } catch {} },
      });

      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", String(chunkSize));
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`);
      return new Response(readable as any, { status: 206, headers });
    }

    // No range header: stream entire blob inline
    const dl = await blob.download();
    const nodeStream = dl.readableStreamBody!;
    const readable = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() { try { (nodeStream as any).destroy?.(); } catch {} },
    });

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", String(size));
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    return new Response(readable as any, { headers });
  } catch (e) {
    console.error("preview attachment error", e);
    return new Response(JSON.stringify({ error: "Failed to preview attachment" }), { status: 500 });
  }
}
