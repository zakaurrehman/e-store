import { z } from "zod";
import { resolveDatabaseUrl } from "../lib/database-url";
import { envOption, paymentProviderList } from "../lib/env-value";
import { resolveSiteUrl } from "../lib/site-url";

// Variables created but left empty (or holding only whitespace) count as unset.
const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
/** An enum option that tolerates case, whitespace and quotes, and names the value it received when invalid. */
const option = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess(envOption, z.enum(values, { error: (issue) => `expected one of ${values.join(", ")} (got ${JSON.stringify(issue.input)})` }).default(fallback));
const booleanFlag = z
  .preprocess(envOption, z.enum(["true", "false", "1", "0"], { error: (issue) => `expected true or false (got ${JSON.stringify(issue.input)})` }).optional())
  .transform((value) => value === "true" || value === "1");

/** Individual variables. Rules that depend on several variables live in crossFieldIssues below. */
const fields = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Empty or unset falls back to the Vercel deployment URL (see lib/site-url.ts).
  APP_URL: z.preprocess((value) => resolveSiteUrl(typeof value === "string" ? value : undefined), z.url()),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  TRUST_PROXY: booleanFlag,

  // DATABASE_URL, or the names Vercel storage integrations add (POSTGRES_URL, STORAGE_POSTGRES_URL…). Accelerate URLs are skipped.
  DATABASE_URL: z.preprocess(
    (value) => resolveDatabaseUrl({ ...process.env, DATABASE_URL: typeof value === "string" ? value : undefined }),
    z
      .string({
        error:
          "required — a direct postgres:// connection string in DATABASE_URL (Vercel may name it STORAGE_POSTGRES_URL); prisma+postgres:// Accelerate URLs are not supported",
      })
      .min(1),
  ),

  STORAGE_DRIVER: option(["local", "s3", "blob"], "local"),
  STORAGE_LOCAL_DIR: z.string().default("var/uploads"),
  MEDIA_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  S3_BUCKET: optionalString,
  S3_REGION: z.preprocess(emptyToUndefined, z.string().default("auto")),
  S3_ENDPOINT: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: booleanFlag,
  BLOB_READ_WRITE_TOKEN: optionalString,

  EMAIL_DRIVER: option(["log", "smtp", "resend"], "log"),
  EMAIL_FROM: z.string().default("Zendropship <hello@localhost>"),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_SECURE: booleanFlag,
  RESEND_API_KEY: optionalString,

  // Unset: cash on delivery in production, plus the sandbox test gateway in development (see lib/env-value.ts).
  PAYMENT_PROVIDERS: z.preprocess((value) => paymentProviderList(value), z.array(z.string())),
  ALLOW_SANDBOX_PAYMENTS: booleanFlag,
  SANDBOX_PAYMENTS_SECRET: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  PAYPAL_MODE: option(["sandbox", "live"], "sandbox"),
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_WEBHOOK_ID: optionalString,

  CRON_SECRET: optionalString,
  RATE_LIMIT_DRIVER: option(["postgres", "memory"], "postgres"),
});

type FieldValues = z.infer<typeof fields>;
type Issue = { path: string; message: string };

/** Rules spanning several variables. Accepts partial values so they can still be checked when other variables are invalid. */
function crossFieldIssues(env: Partial<FieldValues>): Issue[] {
  const issues: Issue[] = [];
  const require = (condition: boolean, path: string, message: string) => {
    if (!condition) issues.push({ path, message });
  };
  const providers = env.PAYMENT_PROVIDERS ?? [];
  if (providers.includes("stripe")) {
    require(!!env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY", "required when stripe is enabled");
    require(!!env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET", "required when stripe is enabled");
  }
  if (providers.includes("paypal")) {
    require(!!env.PAYPAL_CLIENT_ID, "PAYPAL_CLIENT_ID", "required when paypal is enabled");
    require(!!env.PAYPAL_CLIENT_SECRET, "PAYPAL_CLIENT_SECRET", "required when paypal is enabled");
    require(!!env.PAYPAL_WEBHOOK_ID, "PAYPAL_WEBHOOK_ID", "required when paypal is enabled");
  }
  if (providers.includes("sandbox")) {
    require((env.SANDBOX_PAYMENTS_SECRET?.length ?? 0) >= 16, "SANDBOX_PAYMENTS_SECRET", "required (16+ chars) when the sandbox provider is enabled");
    require(
      env.NODE_ENV !== "production" || !!env.ALLOW_SANDBOX_PAYMENTS,
      "PAYMENT_PROVIDERS",
      "the sandbox provider cannot be enabled in production (set ALLOW_SANDBOX_PAYMENTS=true for staging only)",
    );
  }
  if (env.STORAGE_DRIVER === "s3") {
    require(!!env.S3_BUCKET, "S3_BUCKET", "required when STORAGE_DRIVER=s3");
    require(!!env.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID", "required when STORAGE_DRIVER=s3");
    require(!!env.S3_SECRET_ACCESS_KEY, "S3_SECRET_ACCESS_KEY", "required when STORAGE_DRIVER=s3");
    require(!!env.MEDIA_PUBLIC_BASE_URL, "MEDIA_PUBLIC_BASE_URL", "required when STORAGE_DRIVER=s3");
  }
  if (env.STORAGE_DRIVER === "blob") {
    // On Vercel a connected Blob store authenticates through OIDC (BLOB_STORE_ID); elsewhere a read-write token is needed.
    require(
      !!env.BLOB_READ_WRITE_TOKEN || !!(process.env.VERCEL && process.env.BLOB_STORE_ID),
      "BLOB_READ_WRITE_TOKEN",
      "required when STORAGE_DRIVER=blob outside Vercel; on Vercel, connect a public Blob store to the project (adds BLOB_STORE_ID)",
    );
  }
  if (process.env.VERCEL && env.STORAGE_DRIVER === "local") {
    require(false, "STORAGE_DRIVER", "Vercel's filesystem is read-only — set STORAGE_DRIVER=blob (Vercel Blob) or s3");
  }
  if (env.EMAIL_DRIVER === "smtp") require(!!env.SMTP_HOST, "SMTP_HOST", "required when EMAIL_DRIVER=smtp");
  if (env.EMAIL_DRIVER === "resend") require(!!env.RESEND_API_KEY, "RESEND_API_KEY", "required when EMAIL_DRIVER=resend");
  if (env.NODE_ENV === "production") {
    require(!!env.CRON_SECRET, "CRON_SECRET", "required in production");
  }
  return issues;
}

const schema = fields.superRefine((env, ctx) => {
  for (const issue of crossFieldIssues(env)) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
});

export type Env = z.infer<typeof schema>;

/**
 * Readable list of every configuration problem (empty when valid). Zod skips object-level rules while any
 * field is invalid, so cross-field rules are also checked against the fields that did parse — one run reports everything.
 * next.config.ts uses this to stop production builds early.
 */
export function environmentProblems(source: NodeJS.ProcessEnv = process.env): string[] {
  const parsed = schema.safeParse(source);
  if (parsed.success) return [];
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const partial: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields.shape) as Array<[string, z.ZodType]>) {
    const result = field.safeParse(source[key]);
    if (result.success) partial[key] = result.data;
  }
  for (const issue of crossFieldIssues(partial as Partial<FieldValues>)) problems.push(`${issue.path}: ${issue.message}`);
  return [...new Set(problems)];
}

let cached: Env | undefined;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = environmentProblems().map((problem) => `  • ${problem}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

/** Validated server environment. Never import from client components. */
export const env: Env = new Proxy({} as Env, {
  get(_target, key: string) {
    cached ??= load();
    return cached[key as keyof Env];
  },
});

export const appUrl = (path = "/") => new URL(path, env.APP_URL).toString();
