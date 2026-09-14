import path from "node:path";
import { defineConfig } from "vitest/config";

const testEnv = {
  NODE_ENV: "test" as const,
  APP_URL: "http://localhost:3100",
  AUTH_SECRET: "test-secret-0123456789abcdefghijklmnopqrstuvwxyz",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://veyora:veyora@localhost:5433/veyora_test",
  EMAIL_DRIVER: "log",
  PAYMENT_PROVIDERS: "sandbox,cod,stripe,paypal",
  SANDBOX_PAYMENTS_SECRET: "sandbox-test-secret-0123456789",
  STRIPE_SECRET_KEY: "sk_test_veyora_unit",
  STRIPE_WEBHOOK_SECRET: "whsec_veyora_unit_test_secret",
  PAYPAL_CLIENT_ID: "paypal-client",
  PAYPAL_CLIENT_SECRET: "paypal-secret",
  PAYPAL_WEBHOOK_ID: "paypal-webhook",
  RATE_LIMIT_DRIVER: "memory",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "var/test-uploads",
};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    env: testEnv,
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
