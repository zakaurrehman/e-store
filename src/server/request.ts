import { headers } from "next/headers";

export type RequestMeta = { ipAddress: string; userAgent: string | null };

/**
 * Client metadata for rate limiting and audit logs.
 * X-Forwarded-For is only trusted when TRUST_PROXY=true (e.g. on Vercel or behind a known load balancer).
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  const list = await headers();
  return extractRequestMeta(list);
}

export function extractRequestMeta(list: Headers): RequestMeta {
  const trustProxy = process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1";
  let ipAddress = "unknown";
  if (trustProxy) {
    const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
    ipAddress = forwarded || list.get("x-real-ip") || "unknown";
  } else if (process.env.NODE_ENV !== "production") {
    ipAddress = list.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  }
  return { ipAddress, userAgent: list.get("user-agent")?.slice(0, 400) ?? null };
}
