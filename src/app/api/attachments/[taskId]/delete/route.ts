import { NextRequest, NextResponse } from "next/server";
import { getContainerClient } from "@/lib/azure/blob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name"); // full blob name
    if (!name) {
      return NextResponse.json({ error: "name query param required" }, { status: 400 });
    }
    const expectedPrefix = `tasks/${taskId}/`;
    if (!name.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "invalid blob name for task" }, { status: 400 });
    }

    const container = getContainerClient();
    const blob = container.getBlobClient(name);
    const exists = await blob.exists();
    if (!exists) {
      return NextResponse.json({ ok: true, deleted: false });
    }

    await blob.delete();
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    console.error("delete attachment error", e);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
