import { NextRequest, NextResponse } from "next/server";
import { getBlobSasUrl } from "@/lib/azure/blob";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB hard cap for safety

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const body = await req.json().catch(() => null) as { filename?: string; contentType?: string; size?: number } | null;
    if (!body || !body.filename || !body.contentType || typeof body.size !== "number") {
      return NextResponse.json({ error: "filename, contentType, size required" }, { status: 400 });
    }
    if (body.size <= 0 || body.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `file too large (max ${Math.floor(MAX_SIZE_BYTES/1024/1024)} MB)` }, { status: 413 });
    }

    // Sanitize and construct blob name under the task prefix
    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobName = `tasks/${taskId}/${uuidv4()}-${safeName}`;

    // Generate a SAS URL that allows create+write for a very short period
    const { url, expiresOn } = getBlobSasUrl(blobName, "cw", 60 * 5);

    // Client must send these headers during PUT to set blob properties/metadata
    const requiredHeaders = {
      "x-ms-blob-type": "BlockBlob",
      "x-ms-blob-content-type": body.contentType,
      // metadata to be sent by client (we don't embed values here):
      // "x-ms-meta-originalName": safeName
      // "x-ms-meta-taskId": taskId
      // "x-ms-meta-uploadedByName": "..."
      // "x-ms-meta-uploadedById": "..."
    } as const;

    return NextResponse.json({
      uploadUrl: url,
      blobName,
      expiresOn,
      requiredHeaders,
    });
  } catch (e) {
    console.error("sas upload error", e);
    return NextResponse.json({ error: "Failed to create upload SAS" }, { status: 500 });
  }
}
