import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSiteUrl } from "@/lib/site-url";
import { environmentProblems } from "@/server/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveSiteUrl", () => {
  it("uses APP_URL when it is set, without a trailing slash", () => {
    expect(resolveSiteUrl("https://shop.example.com/")).toBe("https://shop.example.com");
  });

  it("falls back to the production domain on a Vercel production deployment when APP_URL is empty", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "e-store.vercel.app");
    vi.stubEnv("VERCEL_URL", "e-store-abc123.vercel.app");
    expect(resolveSiteUrl("")).toBe("https://e-store.vercel.app");
  });

  it("falls back to the unique deployment URL on a Vercel preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "e-store-git-feature.vercel.app");
    expect(resolveSiteUrl("   ")).toBe("https://e-store-git-feature.vercel.app");
  });

  it("falls back to localhost outside Vercel", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    // An empty value (not undefined, which defaults to the test environment's own APP_URL).
    expect(resolveSiteUrl("")).toBe("http://localhost:3000");
  });
});

describe("environmentProblems", () => {
  const production = {
    NODE_ENV: "production",
    APP_URL: "https://shop.example.com",
    AUTH_SECRET: "a".repeat(40),
    DATABASE_URL: "postgresql://user:pass@db.example.com:5432/store",
    PAYMENT_PROVIDERS: "cod",
    CRON_SECRET: "cron-secret-value",
    STORAGE_DRIVER: "blob",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_token",
    EMAIL_DRIVER: "resend",
    RESEND_API_KEY: "re_test_key",
  };
  const problemsFor = (overrides: Record<string, string | undefined>) => environmentProblems({ ...production, ...overrides } as NodeJS.ProcessEnv);
  const fields = (problems: string[]) => problems.map((problem) => problem.split(":")[0]);

  it("accepts a complete production configuration", () => {
    vi.stubEnv("VERCEL", "");
    expect(problemsFor({})).toEqual([]);
  });

  it("refuses local file storage on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(fields(problemsFor({ STORAGE_DRIVER: "local" }))).toContain("STORAGE_DRIVER");
  });

  it("requires a Blob token when STORAGE_DRIVER=blob outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    expect(fields(problemsFor({ BLOB_READ_WRITE_TOKEN: "" }))).toContain("BLOB_READ_WRITE_TOKEN");
  });

  it("accepts a Blob store connected on Vercel without a static token (OIDC)", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BLOB_STORE_ID", "store_example");
    expect(fields(problemsFor({ BLOB_READ_WRITE_TOKEN: "" }))).not.toContain("BLOB_READ_WRITE_TOKEN");
  });

  it("requires a database URL, accepting Vercel's POSTGRES_URL as a fallback", () => {
    vi.stubEnv("POSTGRES_URL", "");
    expect(fields(problemsFor({ DATABASE_URL: "" }))).toContain("DATABASE_URL");
    vi.stubEnv("POSTGRES_URL", "postgresql://user:pass@neon.example.com:5432/store");
    expect(fields(problemsFor({ DATABASE_URL: "" }))).not.toContain("DATABASE_URL");
  });

  it("refuses the sandbox payment gateway in production unless explicitly allowed for staging", () => {
    expect(fields(problemsFor({ PAYMENT_PROVIDERS: "sandbox,cod", SANDBOX_PAYMENTS_SECRET: "s".repeat(20) }))).toContain("PAYMENT_PROVIDERS");
    expect(problemsFor({ PAYMENT_PROVIDERS: "sandbox,cod", SANDBOX_PAYMENTS_SECRET: "s".repeat(20), ALLOW_SANDBOX_PAYMENTS: "true" })).toEqual([]);
  });

  it("accepts option values pasted with quotes, spaces, capitals or Windows line endings, and treats empty ones as unset", () => {
    vi.stubEnv("VERCEL", "");
    expect(problemsFor({ STORAGE_DRIVER: ' "Blob"\r', EMAIL_DRIVER: "RESEND ", PAYPAL_MODE: "", RATE_LIMIT_DRIVER: "   ", TRUST_PROXY: "TRUE" })).toEqual([]);
  });

  it("names the value it received when an option is invalid", () => {
    expect(problemsFor({ STORAGE_DRIVER: "disk" })).toContain('STORAGE_DRIVER: expected one of local, s3, blob (got "disk")');
  });

  it("lists every problem at once", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("POSTGRES_URL", "");
    const problems = fields(problemsFor({ AUTH_SECRET: "", DATABASE_URL: "", CRON_SECRET: "", STORAGE_DRIVER: "local" }));
    expect(problems).toEqual(expect.arrayContaining(["AUTH_SECRET", "DATABASE_URL", "CRON_SECRET", "STORAGE_DRIVER"]));
  });
});
