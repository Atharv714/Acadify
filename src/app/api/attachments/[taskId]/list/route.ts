import { NextRequest, NextResponse } from "next/server";
import { getContainerClient } from "@/lib/azure/blob";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const container = getContainerClient();
    const prefix = `tasks/${taskId}/`;

    const items: Array<{
      name: string;
      blobName: string;
      size: number;
      contentType?: string;
      lastModified?: string;
      uploadedAt?: string;
      uploadedByName?: string;
      uploadedById?: string;
    }> = [];

    for await (const blob of container.listBlobsFlat({ prefix, include: ["metadata"] } as any)) {
      let displayName = (blob.metadata as any)?.originalName || blob.name.substring(prefix.length);
      let uploadedByName = (blob.metadata as any)?.uploadedByName as string | undefined;
      // If client URL-encoded metadata to satisfy header charset, decode best-effort
      try {
        if (displayName && /%[0-9A-Fa-f]{2}/.test(displayName)) {
          displayName = decodeURIComponent(displayName);
        }
        if (uploadedByName && /%[0-9A-Fa-f]{2}/.test(uploadedByName)) {
          uploadedByName = decodeURIComponent(uploadedByName);
        }
      } catch {}
      items.push({
        name: displayName,
        blobName: blob.name,
        size: Number(blob.properties.contentLength || 0),
        contentType: blob.properties.contentType || undefined,
        lastModified: blob.properties.lastModified?.toISOString(),
        uploadedAt: (blob.metadata as any)?.uploadedAt,
        uploadedByName,
        uploadedById: (blob.metadata as any)?.uploadedById,
      });
    }

    return NextResponse.json({ items });
  } catch (e: any) {
    console.error("list attachments error", e);
    return NextResponse.json({ error: "Failed to list attachments" }, { status: 500 });
  }
}
