import { getStorage } from "@/server/storage";

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
  gif: "image/gif",
};

/** Serves locally stored media in development / single-server deployments. S3 and Vercel Blob serve media from their own URLs. */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...key]">) {
  if (process.env.STORAGE_DRIVER && process.env.STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const { key } = await params;
  const storageKey = key.join("/");
  const extension = storageKey.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new Response("Not found", { status: 404 });

  let body: Buffer | null = null;
  try {
    body = await getStorage().read(storageKey);
  } catch {
    body = null;
  }
  if (!body) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
