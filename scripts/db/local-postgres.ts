/**
 * Local development PostgreSQL without Docker or a system install.
 *
 * Downloads (via npm) and runs a real PostgreSQL server whose data lives in ./var/postgres.
 * Production must use a managed PostgreSQL (Neon, Supabase, RDS, Cloud SQL…) — see DEPLOYMENT.md.
 *
 *   npm run db:local            start and keep running (Ctrl+C to stop)
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const user = process.env.LOCAL_PG_USER ?? "veyora";
const password = process.env.LOCAL_PG_PASSWORD ?? "veyora";
const databases = ["veyora", "veyora_test"];
const databaseDir = path.resolve(process.cwd(), "var/postgres");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (message) => console.error("[postgres]", message),
  });

  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log(`Initialising PostgreSQL cluster in ${databaseDir}`);
    await pg.initialise();
  }

  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  for (const name of databases) {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`Created database ${name}`);
    }
  }
  await client.end();

  console.log(`PostgreSQL ready on postgresql://${user}:${password}@localhost:${port}/veyora`);

  const shutdown = async () => {
    console.log("Stopping PostgreSQL…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Keep the process alive.
  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
