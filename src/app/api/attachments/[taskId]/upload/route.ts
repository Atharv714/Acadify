import { NextRequest, NextResponse } from "next/server";
import { getContainerClient } from "@/lib/azure/blob";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const form = await req.formData();
    const files = form.getAll("file");
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "file field required" }, { status: 400 });
    }

    const container = getContainerClient();
    const results: any[] = [];

    for (const f of files) {
      if (!(f instanceof File)) continue;
      const buf = Buffer.from(await f.arrayBuffer());
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blobName = `tasks/${taskId}/${uuidv4()}-${safeName}`;
      const blockBlob = container.getBlockBlobClient(blobName);
      // Optional uploader info, provided by client (UI only; do not use for auth)
      const uploadedByName = (form.get("uploadedByName") as string) || undefined;
      const uploadedById = (form.get("uploadedById") as string) || undefined;
      const nowIso = new Date().toISOString();
      await blockBlob.uploadData(buf, {
        blobHTTPHeaders: { blobContentType: f.type || "application/octet-stream" },
        metadata: {
          taskId,
          uploadedAt: nowIso,
          originalName: f.name,
          ...(uploadedByName ? { uploadedByName } : {}),
          ...(uploadedById ? { uploadedById } : {}),
        },
      });
      results.push({
        name: f.name,
        blobName,
        size: buf.length,
        contentType: f.type || "application/octet-stream",
        uploadedAt: nowIso,
        uploadedByName,
        uploadedById,
      });
    }

    return NextResponse.json({ uploaded: results });
  } catch (e: any) {
    console.error("upload attachment error", e);
    return NextResponse.json({ error: "Failed to upload attachment" }, { status: 500 });
  }
}
