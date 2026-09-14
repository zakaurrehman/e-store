import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/** URL-safe random token (default 256 bits). */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(value: string, secret: string = env.AUTH_SECRET) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Produces `value.signature`; tamper-evident, not encrypted. */
export function signValue(value: string, secret?: string) {
  return `${value}.${hmacSha256(value, secret)}`;
}

export function unsignValue(signed: string | undefined | null, secret?: string): string | null {
  if (!signed) return null;
  const index = signed.lastIndexOf(".");
  if (index <= 0) return null;
  const value = signed.slice(0, index);
  const signature = signed.slice(index + 1);
  return safeEqual(signature, hmacSha256(value, secret)) ? value : null;
}
