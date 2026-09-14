import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  publicUrl(key: string): string;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,300}$/;

export function assertValidKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

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

  publicUrl(key: string) {
    return `/media/${key}`;
  }
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private client: Promise<import("@aws-sdk/client-s3").S3Client> | undefined;

  private getClient() {
    this.client ??= import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
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
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
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

  publicUrl(key: string) {
    return `${(process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}/${key}`;
  }
}

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  provider ??= process.env.STORAGE_DRIVER === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
  return provider;
}
