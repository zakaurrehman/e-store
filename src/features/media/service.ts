import sharp, { type Metadata } from "sharp";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { randomToken, sha256 } from "@/server/security/crypto";
import { getStorage } from "@/server/storage";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "gif", "heif"]);
const MAX_INPUT_PIXELS = 80_000_000;

export type IngestImageInput = {
  buffer: Buffer;
  filename: string;
  folder?: string;
  alt?: string;
  credit?: string | null;
  uploadedById?: string | null;
  maxDimension?: number;
};

function sanitiseFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "image";
  return base.replace(/[^\w.\- ]+/g, "").slice(0, 120) || "image";
}

/**
 * Validates an uploaded image by decoding it (not by trusting the extension or MIME type), strips metadata,
 * auto-rotates, bounds its size and stores an optimised WebP master. next/image derives AVIF/WebP renditions.
 * Identical files in the same folder are de-duplicated by checksum.
 */
export async function ingestImage(input: IngestImageInput) {
  if (input.buffer.length === 0) throw new DomainError("INVALID_IMAGE", "The file is empty.");
  if (input.buffer.length > MAX_UPLOAD_BYTES) throw new DomainError("FILE_TOO_LARGE", "Images must be 10 MB or smaller.");

  let metadata: Metadata;
  try {
    metadata = await sharp(input.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new DomainError("INVALID_IMAGE", `“${sanitiseFilename(input.filename)}” isn't a valid image.`);
  }
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new DomainError("UNSUPPORTED_IMAGE", "Upload a JPEG, PNG, WebP, AVIF or GIF image.");
  }
  if ((metadata.width ?? 0) < 64 || (metadata.height ?? 0) < 64) {
    throw new DomainError("IMAGE_TOO_SMALL", "Images must be at least 64 × 64 pixels.");
  }

  const folder = (input.folder ?? "library").replace(/[^a-z0-9-]/g, "") || "library";
  const checksum = sha256(input.buffer.toString("base64"));
  const duplicate = await db.mediaAsset.findFirst({ where: { checksum, folder, deletedAt: null } });
  if (duplicate) return duplicate;

  const maxDimension = input.maxDimension ?? 2400;
  let data: Buffer;
  let info: { width: number; height: number };
  try {
    ({ data, info } = await sharp(input.buffer, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, effort: 5, smartSubsample: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    // The header parsed but the pixels did not: a truncated or corrupted file.
    throw new DomainError("INVALID_IMAGE", `“${sanitiseFilename(input.filename)}” could not be read. Try saving the screenshot again, or upload a different file.`);
  }

  const now = new Date();
  const storageKey = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, "")}.webp`;
  const storage = getStorage();
  const url = await storage.put(storageKey, data, "image/webp");

  try {
    return await db.mediaAsset.create({
      data: {
        storageKey,
        url,
        filename: sanitiseFilename(input.filename),
        mimeType: "image/webp",
        sizeBytes: data.length,
        width: info.width,
        height: info.height,
        alt: (input.alt ?? "").slice(0, 300),
        credit: input.credit ?? null,
        folder,
        checksum,
        uploadedById: input.uploadedById ?? null,
      },
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

/** Soft-deletes media that is not in use; refuses when products/banners still reference it. */
export async function deleteMedia(id: string) {
  const asset = await db.mediaAsset.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { productImages: true, variants: true, banners: true, mobileBanners: true, categories: true, brands: true, collections: true } } },
  });
  const usage = Object.values(asset._count).reduce((sum, count) => sum + count, 0);
  if (usage > 0) {
    throw new DomainError("MEDIA_IN_USE", `This image is used in ${usage} place${usage === 1 ? "" : "s"}. Remove it there first.`);
  }
  await db.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await getStorage().delete(asset.storageKey).catch((error) => console.error("[media] storage delete failed", error));
}
