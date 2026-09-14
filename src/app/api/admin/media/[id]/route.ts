import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { deleteMedia } from "@/features/media/service";
import { hasPermission } from "@/lib/permissions";
import { writeAudit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";

async function staff() {
  const user = await getCurrentUser();
  if (!user || !user.role.isStaff || !hasPermission(user.permissions, "media.manage")) return null;
  return user;
}

const patchSchema = z.object({ alt: z.string().max(300).optional(), credit: z.string().max(200).nullable().optional(), folder: z.string().regex(/^[a-z0-9-]{1,40}$/).optional() });

export async function PATCH(request: NextRequest, { params }: RouteContext<"/api/admin/media/[id]">) {
  const user = await staff();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const asset = await db.mediaAsset.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: asset.id, alt: asset.alt, credit: asset.credit, folder: asset.folder });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext<"/api/admin/media/[id]">) {
  const user = await staff();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await deleteMedia(id);
    await writeAudit({ actorId: user.id, action: "media.delete", entityType: "MediaAsset", entityId: id, summary: "Deleted media asset" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isDomainError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[media] delete failed", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
