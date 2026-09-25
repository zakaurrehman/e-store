import { headers } from "next/headers";
import { envFlag } from "@/lib/env-value";

export type RequestMeta = { ipAddress: string; userAgent: string | null };

/** What `ipAddress` holds when the client's address cannot be known — never a bucket to share. */
export const UNKNOWN_IP = "unknown";

/**
 * Client metadata for rate limiting and audit logs.
 * On Vercel the client address comes from the headers Vercel's edge sets (it overwrites any value a client
 * sends, so they cannot be spoofed); elsewhere X-Forwarded-For is only trusted when TRUST_PROXY=true.
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  const list = await headers();
  return extractRequestMeta(list);
}

const first = (value: string | null) => value?.split(",")[0]?.trim() || null;

export function extractRequestMeta(list: Headers): RequestMeta {
  let ipAddress = UNKNOWN_IP;
  if (process.env.VERCEL === "1") {
    ipAddress = first(list.get("x-vercel-forwarded-for")) || first(list.get("x-real-ip")) || first(list.get("x-forwarded-for")) || UNKNOWN_IP;
  } else if (envFlag(process.env.TRUST_PROXY)) {
    ipAddress = first(list.get("x-forwarded-for")) || list.get("x-real-ip") || UNKNOWN_IP;
  } else if (process.env.NODE_ENV !== "production") {
    ipAddress = first(list.get("x-forwarded-for")) || "local";
  }
  return { ipAddress, userAgent: list.get("user-agent")?.slice(0, 400) ?? null };
}
