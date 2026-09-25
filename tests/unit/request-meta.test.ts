import { afterEach, describe, expect, it, vi } from "vitest";
import { extractRequestMeta, UNKNOWN_IP } from "@/server/request";
import { rateLimitByIp } from "@/server/security/rate-limit";

const headersWith = (values: Record<string, string>) => new Headers(values);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the client address used for rate limits", () => {
  it("comes from Vercel's own headers on Vercel, which clients cannot spoof", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUST_PROXY", "false");
    expect(extractRequestMeta(headersWith({ "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "203.0.113.9" })).ipAddress).toBe("198.51.100.7");
    expect(extractRequestMeta(headersWith({ "x-real-ip": "198.51.100.8" })).ipAddress).toBe("198.51.100.8");
    expect(extractRequestMeta(headersWith({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" })).ipAddress).toBe("198.51.100.9");
  });

  it("is unknown in production behind an untrusted proxy — a forwarded header is not believed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY", "false");
    expect(extractRequestMeta(headersWith({ "x-forwarded-for": "203.0.113.9" })).ipAddress).toBe(UNKNOWN_IP);
  });

  it("comes from X-Forwarded-For when a proxy is trusted, and falls back to local in development", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY", "true");
    expect(extractRequestMeta(headersWith({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })).ipAddress).toBe("203.0.113.9");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TRUST_PROXY", "false");
    expect(extractRequestMeta(headersWith({})).ipAddress).toBe("local");
  });

  it("never puts every visitor in one shared bucket when the address is unknown", async () => {
    // The old behaviour: with no address, everyone counted as "unknown" and the 6th sign-up anywhere was refused.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await rateLimitByIp("openStore", UNKNOWN_IP)).success).toBe(true);
    }
    // A real address still has its own limit.
    const results = [];
    for (let attempt = 0; attempt < 21; attempt += 1) results.push((await rateLimitByIp("openStore", "198.51.100.20")).success);
    expect(results.filter(Boolean)).toHaveLength(20);
    expect(results.at(-1)).toBe(false);
  });
});
