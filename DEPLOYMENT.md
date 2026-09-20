# Deployment

Zendropship runs anywhere Node.js 22.12+ can run `next start` (a VM, container or managed Node host) or on Vercel. It needs a managed PostgreSQL database and — for Vercel, any serverless host or more than one server instance — object storage: Vercel Blob or an S3-compatible bucket.

> **Status:** the production build (`next build`) and production server (`next start`) have been verified locally, including an end-to-end test run against it. Zendropship has not yet been fully deployed to a hosting platform, and Stripe, PayPal, Vercel Blob, S3 and SMTP/Resend have not been tested with real accounts. Test each of them in test mode before taking real orders.

## 1. Provision services

| Service | Requirement |
| --- | --- |
| PostgreSQL 15+ | The `pg_trgm` and `unaccent` extensions must be allowed (the first migration creates them). Vercel Postgres (Neon) supports both. Enable automated backups. |
| Object storage | **Vercel Blob** (connect a Blob store to the project) or any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) with a public URL for reads. The local disk driver is only for a single long-running server and is refused on Vercel. |
| Email | An SMTP account or a Resend API key, with the sending domain verified (SPF/DKIM). |
| Payments | Stripe and/or PayPal accounts. Start in test/sandbox mode. |

## 2. Environment variables

Set these on the host for **both the build and runtime**. `.env.example` documents every variable. Production builds and `next start` check the environment first and stop with a list of every missing or invalid variable.

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` (set automatically by `next build` / `next start`) |
| `APP_URL` | The platform site's public `https://` origin, no trailing slash (e.g. `https://www.zendropship.io`). On Vercel, an unset or empty value falls back to the deployment URL. |
| `STORE_DOMAIN` | Optional. The domain stores hang off (`zendropship.io` → stores at `<name>.zendropship.io`). Derived from `APP_URL` without `www.` when unset; production deployments stop if it would resolve to `localhost`. |
| `AUTH_SECRET` | 32+ random characters, unique per environment |
| `TRUST_PROXY` | `true` behind Vercel or a reverse proxy, so client IPs come from `X-Forwarded-For` |
| `DATABASE_URL` | A direct `postgres://` connection string. Databases connected in Vercel's Storage tab are found automatically, including under Vercel's default `STORAGE_` prefix (`STORAGE_POSTGRES_URL`, `STORAGE_DATABASE_URL`); Neon's direct `…_UNPOOLED` URL is used for migrations when present. Prisma Accelerate (`prisma+postgres://`) URLs are not supported. `DATABASE_POOL_MAX` sets the pool size (default 10). |
| `STORAGE_DRIVER` | `blob` for Vercel Blob: on Vercel, connecting a **public** Blob store adds `BLOB_STORE_ID` and the SDK authenticates automatically; outside Vercel (for example when seeding from your machine) set `BLOB_READ_WRITE_TOKEN` from the store's settings. Or `s3` with `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` |
| `MEDIA_PUBLIC_BASE_URL` | With `s3` only: the bucket's public origin, also allowed for `next/image` at build time |
| `EMAIL_DRIVER` | `smtp` (`SMTP_*`) or `resend` (`RESEND_API_KEY`), plus `EMAIL_FROM`. The `log` driver cannot write files on Vercel: preview deployments print emails to the server log, and production deployments record them as failed (never logging their links) until a real provider is set. |
| `PAYMENT_PROVIDERS` | e.g. `stripe,paypal,cod`. When unset, production offers cash on delivery (`cod`) only. **Never `sandbox` in production** — it is refused unless `ALLOW_SANDBOX_PAYMENTS=true`, which is for staging only. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | When Stripe is enabled |
| `PAYPAL_MODE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | When PayPal is enabled (`PAYPAL_MODE=live` for real payments) |
| `CRON_SECRET` | Required in production |
| `RATE_LIMIT_DRIVER` | `postgres` (shared across instances) |
| `DATABASE_POOL_MAX` | Optional. Connections per server instance — 2 on Vercel and 10 elsewhere by default. Serverless runs many instances at once against a database that allows only a limited number of connections in total (Prisma Postgres' direct connection allows 45), so raise it only on a single long-running server. "Too many connections" errors on dynamic pages mean this is set too high for the plan. |
| `SEED_DEMO_DATA` | `false` (demo data is refused in production anyway) |

Keep secrets in the platform's secret store. Never commit `.env` files.

## 3. Build and release

Run migrations **before** the build: pages prerender using live catalogue and settings data, so the build needs a reachable, migrated database.

```bash
npm ci                       # includes dev dependencies (Prisma CLI) for this step
npm run db:deploy            # apply migrations
npm run build                # prisma generate + next build
npm run start                # or your platform's start command
```

### Vercel

1. In the project's **Storage** tab, connect a **Postgres** database, and create and connect a **Blob** store with **public** access (the access mode can't be changed later). Vercel adds the connection variables to the project, sometimes with a `STORAGE_` prefix; Zendropship finds them either way. Prisma Postgres and Neon both work.
2. Under **Settings → Environment Variables**, add the rest of step 2 for Production (and Preview, if you use it). The minimum for a first deploy is `AUTH_SECRET`, `CRON_SECRET`, `TRUST_PROXY=true` and `STORAGE_DRIVER=blob`; set `PAYMENT_PROVIDERS` when you add Stripe or PayPal, and `APP_URL` once you have a domain.
3. Nothing to set for the build command: `vercel.json` already runs `npm run db:deploy && npm run build`, so migrations are applied before every build. Preview deployments that share the production database apply the same committed migrations.
4. Redeploy. If anything is still missing, the build stops at the start and lists it.
5. Run the first-time seed (step 4) from your machine with the production `DATABASE_URL`, `STORAGE_DRIVER=blob` and the Blob store's `BLOB_READ_WRITE_TOKEN` (from the store's settings) set for that command, so the admin account, settings and starter images are created in the production database and Blob store. Don't copy production values into your local `.env`, which should keep pointing at your development database.

## 4. First-time data

```bash
SEED_SKIP_CATALOG=true SEED_ADMIN_EMAIL=you@yourdomain.com SEED_ADMIN_PASSWORD='<12+ chars>' npm run db:seed
```

This creates roles and permissions (including the store-owner role), default settings, shipping zones and tax rates, the first super admin, the demo store and starter content, without the demo catalogue. On a database that already had products before the platform release, the `stores` migration creates the demo store (address `demo`) with every existing product, gives existing orders and bags to it, and sets each variant's wholesale cost to 55% of its price where none was recorded — **review wholesale costs in the admin before owners start selling**, because they decide owners' margins. Pages built before the seed ran can be served from cache for up to an hour, so **redeploy once the seed has finished** to rebuild them with the new data. Then:

1. Sign in at `/admin`, change the admin password and remove `SEED_ADMIN_PASSWORD` from the environment.
2. **Settings → Store settings** — store name, legal name, support contact, address, currency, SEO and social links.
3. **Settings → Shipping & tax** — replace the example zones, methods and tax rates with your own. Tax rates are examples only; confirm your obligations with an adviser.
4. Replace the starter pages (terms, privacy, returns, shipping) with your own reviewed text.
5. Add products manually or import them (IMPORT_GUIDE.md).
6. Create individual staff accounts with the least privilege they need (ADMIN_GUIDE.md).

## 5. Payment webhooks

Orders are marked paid only from verified provider events, so webhooks must be configured before taking payments.

**Stripe** — add an endpoint `https://<your-domain>/api/payments/webhooks/stripe` subscribed to:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` and `charge.refunded`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`. Enable Apple Pay and Google Pay in the Stripe dashboard if wanted.

**PayPal** — create a webhook for `https://<your-domain>/api/payments/webhooks/paypal` with the events `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.PENDING` and `PAYMENT.CAPTURE.REFUNDED`, and put its id in `PAYPAL_WEBHOOK_ID`.

Customers return through `/checkout/return/<provider>` automatically. Place a test-mode order and confirm it turns **Paid** in the admin only after the webhook arrives, and that the provider dashboard shows successful (2xx) deliveries.

## 6. Background jobs

`GET /api/cron` must run about every 5 minutes. It retries email deliveries, cancels orders left unpaid for 2 hours (returning their stock) and cleans up expired sessions, tokens, guest carts and rate-limit buckets.

- **Vercel** — `vercel.json` schedules `/api/cron` once a day (`0 3 * * *`), which every plan allows: on the Hobby plan, a cron that runs more often makes the deployment fail. With `CRON_SECRET` set, Vercel sends it as a bearer token. On Pro, change the schedule to `*/5 * * * *`. On Hobby, call the endpoint every 5 minutes from an external scheduler (see below); otherwise unpaid orders are released and failed emails retried only once a day.
- **Elsewhere** — call it from any scheduler:

  ```bash
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron
  ```

  It returns JSON with `"ok": true`, and 401 without the correct secret.

## 7. Domains: the platform site and store subdomains

Zendropship answers on two kinds of host from one deployment:

| Host | Serves |
| --- | --- |
| `www.zendropship.io` (and the apex) | The platform site: landing page, catalogue, sign-up, owner dashboard, admin |
| `<name>.zendropship.io` | That owner's store; `demo.zendropship.io` is the platform-run demo store |

`src/proxy.ts` reads the host and serves the right one; nothing else needs configuring per store.

**Platform domain.** In **Settings → Domains**, add `zendropship.io` and `www.zendropship.io`. Set `APP_URL=https://www.zendropship.io`.

**Store subdomains need a wildcard domain, and Vercel only issues wildcard certificates for domains that use Vercel's nameservers.** So:

1. In Vercel, open **Domains** (team level) → `zendropship.io` and note the records you will need to keep: anything besides the site itself, such as `MX` and `TXT` records for email. Recreate them in Vercel DNS first.
2. At the registrar (Namecheap → Domain List → Manage → **Nameservers** → Custom DNS), set `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Propagation usually takes minutes, occasionally up to 48 hours.
3. In the project's **Settings → Domains**, add `*.zendropship.io`. Vercel verifies it and issues the wildcard certificate.
4. Check: `https://demo.zendropship.io` shows the demo store.

**Release order.** Set up the wildcard domain **before** deploying the platform version: on the platform site, shopping paths (`/cart`, `/checkout`, `/orders/…`) now redirect to the demo store at `demo.zendropship.io`, and product pages redirect to `/catalog`, so the demo store must resolve first.

Sessions and bags are per host: shoppers sign in on the store they buy from; owners and staff sign in on `www`. Customer emails link to the store's own address; owner and staff emails link to the platform site. Set `EMAIL_FROM` to an address on the domain (for example `Zendropship <hello@zendropship.io>`) and verify the domain with your email provider. Owner stores send under the store's name in the email body; the sending address stays the platform's.

Custom domains for individual stores (`shop.maya.com`) are not supported yet — the `Store.customDomain` column is reserved for it.

## 8. Post-deploy checks

- `/` loads and the response carries `Content-Security-Policy` and `Strict-Transport-Security` headers.
- `/robots.txt` and `/sitemap.xml` list your production domain, and `https://demo.zendropship.io/sitemap.xml` lists the demo store's own URLs.
- `https://demo.zendropship.io` shows the demo store; opening a test store at `/start` makes `https://<its-address>.zendropship.io` live immediately, and **Admin → Stores** lists it.
- Signed out, `/account` and `/admin` redirect to `/login`.
- Registration sends a verification email that arrives and links to your domain.
- A test-mode order is paid via webhook, appears in **Admin → Orders**, and the confirmation email arrives.
- `/api/cron` returns `ok` when called with the secret.
- Uploading an image in **Admin → Media library** stores it in your Blob store or bucket, and it displays on the storefront.

## Security notes

- Session cookies use the `__Host-` prefix and require HTTPS.
- The CSP allows scripts and frames only from the site itself plus Stripe and PayPal. Adding third-party scripts (analytics, chat) requires updating the CSP in `next.config.ts`.
- Every administrative action is recorded in **Settings → Audit log**.
- Advisories currently reported by `npm audit` affect `mysql2`, pulled in only by the Prisma CLI (a development dependency, unused with PostgreSQL). The suggested `npm audit fix --force` would downgrade Prisma to v6, so do not run it; upgrade Prisma when a patched version is released.
