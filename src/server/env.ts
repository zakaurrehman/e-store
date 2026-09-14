import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const booleanFlag = z
  .preprocess(emptyToUndefined, z.enum(["true", "false", "1", "0"]).optional())
  .transform((value) => value === "true" || value === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    TRUST_PROXY: booleanFlag,

    DATABASE_URL: z.string().min(1),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("var/uploads"),
    MEDIA_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    S3_BUCKET: optionalString,
    S3_REGION: z.preprocess(emptyToUndefined, z.string().default("auto")),
    S3_ENDPOINT: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: booleanFlag,

    EMAIL_DRIVER: z.enum(["log", "smtp", "resend"]).default("log"),
    EMAIL_FROM: z.string().default("Veyora <hello@localhost>"),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: booleanFlag,
    RESEND_API_KEY: optionalString,

    PAYMENT_PROVIDERS: z
      .string()
      .default("sandbox,cod")
      .transform((value) =>
        value
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ALLOW_SANDBOX_PAYMENTS: booleanFlag,
    SANDBOX_PAYMENTS_SECRET: optionalString,
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYPAL_CLIENT_ID: optionalString,
    PAYPAL_CLIENT_SECRET: optionalString,
    PAYPAL_WEBHOOK_ID: optionalString,

    CRON_SECRET: optionalString,
    RATE_LIMIT_DRIVER: z.enum(["postgres", "memory"]).default("postgres"),
  })
  .superRefine((env, ctx) => {
    const require = (condition: boolean, path: string, message: string) => {
      if (!condition) ctx.addIssue({ code: "custom", path: [path], message });
    };
    const providers = env.PAYMENT_PROVIDERS;
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
      require(
        (env.SANDBOX_PAYMENTS_SECRET?.length ?? 0) >= 16,
        "SANDBOX_PAYMENTS_SECRET",
        "required (16+ chars) when the sandbox provider is enabled",
      );
      require(
        env.NODE_ENV !== "production" || env.ALLOW_SANDBOX_PAYMENTS,
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
    if (env.EMAIL_DRIVER === "smtp") require(!!env.SMTP_HOST, "SMTP_HOST", "required when EMAIL_DRIVER=smtp");
    if (env.EMAIL_DRIVER === "resend") require(!!env.RESEND_API_KEY, "RESEND_API_KEY", "required when EMAIL_DRIVER=resend");
    if (env.NODE_ENV === "production") {
      require(!!env.CRON_SECRET, "CRON_SECRET", "required in production");
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`).join("\n");
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
