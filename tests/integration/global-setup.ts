import { execSync } from "node:child_process";

/**
 * Runs once before the integration suite: applies migrations to the dedicated test database.
 * Refuses to touch any database whose name does not end in "_test".
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://veyora:veyora@localhost:5433/veyora_test";
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to run integration tests against "${name}": TEST_DATABASE_URL must point at a *_test database.`);
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
