import { NextResponse, type NextRequest } from "next/server";
import { ingestImage, MAX_UPLOAD_BYTES } from "@/features/media/service";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { extractRequestMeta } from "@/server/request";
import { rateLimit } from "@/server/security/rate-limit";

async function staff() {
  const user = await getCurrentUser();
  if (!user || !user.role.isStaff || !hasPermission(user.permissions, "media.manage")) return null;
  return user;
}

export type MediaItem = { id: string; url: string; alt: string; filename: string; width: number | null; height: number | null; sizeBytes: number; folder: string; createdAt: string; credit: string | null };

/** GET /api/admin/media?q=&folder=&page= — media library listing for the picker and library page. */
export async function GET(request: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const folder = params.get("folder")?.trim() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = 48;
  const where = {
    deletedAt: null,
    ...(folder ? { folder } : {}),
    ...(q ? { OR: [{ filename: { contains: q, mode: "insensitive" as const } }, { alt: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, items, folders] = await Promise.all([
    db.mediaAsset.count({ where }),
    db.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.mediaAsset.groupBy({ by: ["folder"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  return NextResponse.json({
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    folders: folders.map((row) => ({ name: row.folder, count: row._count._all })),
    items: items.map((item) => ({ id: item.id, url: item.url, alt: item.alt, filename: item.filename, width: item.width, height: item.height, sizeBytes: item.sizeBytes, folder: item.folder, createdAt: item.createdAt.toISOString(), credit: item.credit }) satisfies MediaItem),
  });
}

/** POST multipart form: files[] + folder + alt — validates, optimises and stores images. */
export async function POST(request: NextRequest) {
  const user = await staff();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const meta = extractRequestMeta(request.headers);
  const limit = await rateLimit("upload", user.id);
  if (!limit.success) return NextResponse.json({ error: "Too many uploads — please wait a few minutes." }, { status: 429 });
  const form = await request.formData();
  const folder = String(form.get("folder") ?? "library");
  const alt = String(form.get("alt") ?? "");
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Choose at least one image." }, { status: 400 });
  const uploaded: MediaItem[] = [];
  const errors: string[] = [];
  for (const file of files.slice(0, 20)) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: larger than 10 MB`);
      continue;
    }
    try {
      const asset = await ingestImage({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, folder, alt, uploadedById: user.id });
      uploaded.push({ id: asset.id, url: asset.url, alt: asset.alt, filename: asset.filename, width: asset.width, height: asset.height, sizeBytes: asset.sizeBytes, folder: asset.folder, createdAt: asset.createdAt.toISOString(), credit: asset.credit });
    } catch (error) {
      errors.push(`${file.name}: ${isDomainError(error) ? error.message : "upload failed"}`);
      if (!isDomainError(error)) console.error("[media] upload failed", error, meta.ipAddress);
    }
  }
  return NextResponse.json({ uploaded, errors }, { status: uploaded.length ? 201 : 400 });
}
