# Local setup

## Requirements

- Node.js 22.12 or newer (developed on Node 24) and npm
- No Docker or system PostgreSQL needed: `npm run db:local` runs a real PostgreSQL server from npm
- About 1 GB of disk for dependencies, the local database and cached demo photos
- Internet access for the first `npm run db:seed` (demo photos are downloaded from Unsplash once and cached in `.cache/seed-media`)

## 1. Install

```bash
npm install
```

## 2. Configure the environment

```bash
cp .env.example .env
```

Every variable is documented in `.env.example` and validated at startup by `src/server/env.ts`. For local development set at least:

| Variable | Value |
| --- | --- |
| `APP_URL` | The URL you will open, including the port, e.g. `http://localhost:3000` |
| `AUTH_SECRET` | 32+ random characters |
| `SANDBOX_PAYMENTS_SECRET` | 16+ random characters (the local test gateway signs its webhooks with it) |
| `CRON_SECRET` | Random string used to call `/api/cron` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | The first super-admin account (password 12+ characters) |

Generate random values with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Keep `EMAIL_DRIVER=log` locally: emails are written to `var/mail/mailbox.jsonl` (plus rendered HTML files) instead of being sent. Never commit `.env`.

## 3. Start the database

In a separate terminal:

```bash
npm run db:local
```

This starts PostgreSQL on port 5433 with data in `var/postgres` and creates the `veyora` and `veyora_test` databases. Leave it running.

## 4. Create the schema and seed data

```bash
npm run db:generate   # Prisma client
npm run db:deploy     # apply migrations
npm run db:seed       # roles, settings, shipping & tax, admin, demo catalogue, content
```

The first seed downloads and optimises the demo photos (a few minutes). Re-running the seed is safe.

Optional: set `SEED_DEMO_DATA=true` before seeding to add development-only demo customers, orders (placed through the real checkout and confirmed through signed sandbox webhooks) and approved reviews, so the dashboard and order screens have data. Demo customers have no password and cannot sign in. It refuses to run in production.

## 5. Run

```bash
npm run dev
```

Open `APP_URL` for the platform site. The admin is at `/admin` — sign in at `/login` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and change the password.

Stores run on subdomains of the same server: the demo store is at `http://demo.localhost:<port>`, and a store you open at `/start` is at `http://<address>.localhost:<port>`. Chrome, Edge and Firefox resolve `*.localhost` to your machine without any setup. Sessions and bags are per host, so sign in to a store separately from the platform.

Useful locally:

- **Payments** — with `PAYMENT_PROVIDERS=sandbox,cod`, "Test card" opens a simulated gateway page where you choose success or a declined card; the result reaches the store through a signed webhook, exactly like a real provider.
- **Emails** — verification and password-reset links are in `var/mail/mailbox.jsonl`.
- **Background jobs** — `npm run jobs:run` retries failed email deliveries, expires orders unpaid after 2 hours and cleans up expired sessions, tokens and carts.
- **Catalogue import** — see [IMPORT_GUIDE.md](IMPORT_GUIDE.md).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Every page returns 500 with a Prisma error | The database is not running. Start `npm run db:local`. If pages still fail afterwards (the dev log shows `write EPIPE` / "Jest worker encountered child process exceptions"), restart `npm run dev`. |
| `Invalid environment configuration` | A required variable is missing or invalid; the message lists each one. |
| "Too many attempts" while testing | Rate limits are stored in PostgreSQL. Wait for the window to pass, or set `RATE_LIMIT_DRIVER=memory` locally and restart the dev server to reset them. |
| Links in emails point to the wrong port | `APP_URL` must match the address you open. |
| A second `next dev` refuses to start | One is already running for this project; Next.js prints its URL and PID. |
