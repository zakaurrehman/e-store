import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanEnvValue, envFlag, envOption } from "@/lib/env-value";

export interface StorageProvider {
  readonly name: string;
  /** Stores the object and returns the public URL it is served from. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Buffer | null>;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,300}$/;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function assertValidKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

/** Files on local disk, served by the /media route. For development and single long-running servers. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(directory = process.env.STORAGE_LOCAL_DIR ?? "var/uploads") {
    // The upload root is configurable at runtime; keep Turbopack from tracing the whole project into the server bundle.
    this.root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), directory);
  }

  private resolve(key: string) {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Storage key escapes the storage root");
    return full;
  }

  async put(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `/media/${key}`;
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async read(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
}

/** Any S3-compatible object store (AWS S3, Cloudflare R2, MinIO), served from MEDIA_PUBLIC_BASE_URL. */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private client: Promise<import("@aws-sdk/client-s3").S3Client> | undefined;

  private getClient() {
    this.client ??= import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: envFlag(process.env.S3_FORCE_PATH_STYLE),
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
          },
        }),
    );
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertValidKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.getClient()).send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
      }),
    );
    return `${(process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}/${key}`;
  }

  async delete(key: string) {
    assertValidKey(key);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.getClient()).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  }

  async read(key: string) {
    assertValidKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const result = await (await this.getClient()).send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
}

/**
 * Vercel Blob (use a public store). On Vercel a connected store authenticates automatically through OIDC;
 * outside Vercel (e.g. seeding from a laptop) BLOB_READ_WRITE_TOKEN is used.
 * Objects are stored under their key — keys are already random, so no extra suffix — and served from the Blob CDN.
 */
export class VercelBlobStorageProvider implements StorageProvider {
  readonly name = "blob";

  /** Only pass a token when one is configured, so the SDK can otherwise resolve OIDC credentials itself. */
  private get credentials() {
    const token = cleanEnvValue(process.env.BLOB_READ_WRITE_TOKEN);
    return token ? { token } : {};
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertValidKey(key);
    const { put } = await import("@vercel/blob");
    const result = await put(key, body, { access: "public", contentType, addRandomSuffix: false, cacheControlMaxAge: ONE_YEAR_SECONDS, ...this.credentials });
    return result.url;
  }

  async delete(key: string) {
    assertValidKey(key);
    const { del } = await import("@vercel/blob");
    await del(key, this.credentials);
  }

  async read(key: string) {
    assertValidKey(key);
    const { head } = await import("@vercel/blob");
    try {
      const { url } = await head(key, this.credentials);
      const response = await fetch(url);
      return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  const driver = envOption(process.env.STORAGE_DRIVER);
  provider ??= driver === "s3" ? new S3StorageProvider() : driver === "blob" ? new VercelBlobStorageProvider() : new LocalStorageProvider();
  return provider;
}
