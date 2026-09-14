# Deployment

Veyora runs anywhere Node.js 22.12+ can run `next start` (a VM, container or managed Node host) or on Vercel. It needs a managed PostgreSQL database and, for more than one server instance or any serverless host, S3-compatible object storage.

> **Status:** the production build (`next build`) and production server (`next start`) have been verified locally, including an end-to-end test run against it. Veyora has not yet been deployed to a hosting platform, and Stripe, PayPal, S3 and SMTP/Resend have not been tested with real accounts. Test each of them in the provider's test mode before taking real orders.

## 1. Provision services

| Service | Requirement |
| --- | --- |
| PostgreSQL 15+ | The `pg_trgm` and `unaccent` extensions must be allowed (the first migration creates them). Enable automated backups. |
| Object storage | Any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) with a public CDN URL for reads. The local disk driver is only for a single long-running server. |
| Email | An SMTP account or a Resend API key, with the sending domain verified (SPF/DKIM). |
| Payments | Stripe and/or PayPal accounts. Start in test/sandbox mode. |

## 2. Environment variables

Set these on the host for **both the build and runtime**. `.env.example` documents every variable; startup validation rejects missing or unsafe values.

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` (set automatically by `next build` / `next start`) |
| `APP_URL` | Your public `https://` origin, no trailing slash |
| `AUTH_SECRET` | 32+ random characters, unique per environment |
| `TRUST_PROXY` | `true` behind Vercel or a reverse proxy, so client IPs come from `X-Forwarded-For` |
| `DATABASE_URL` | Managed PostgreSQL connection string. `DATABASE_POOL_MAX` sets the pool size (default 10). |
| `STORAGE_DRIVER` | `s3`, with `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` |
| `MEDIA_PUBLIC_BASE_URL` | Public CDN origin of the bucket. It is also allowed for `next/image` at build time. |
| `EMAIL_DRIVER` | `smtp` (`SMTP_*`) or `resend` (`RESEND_API_KEY`), plus `EMAIL_FROM` |
| `PAYMENT_PROVIDERS` | e.g. `stripe,paypal,cod`. **Never `sandbox` in production** — it is refused unless `ALLOW_SANDBOX_PAYMENTS=true`, which is for staging only. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | When Stripe is enabled |
| `PAYPAL_MODE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | When PayPal is enabled (`PAYPAL_MODE=live` for real payments) |
| `CRON_SECRET` | Required in production |
| `RATE_LIMIT_DRIVER` | `postgres` (shared across instances) |
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

On Vercel:

- Set **Build Command** to `npm run db:deploy && npm run build`, and add the environment variables from step 2 to the Production environment (and Preview, if you use it). They are available during the build, which needs `DATABASE_URL` to migrate and prerender.
- The filesystem is read-only, so `STORAGE_DRIVER=s3` and `EMAIL_DRIVER=smtp` or `resend` are **required**. The `local` storage and `log` email drivers write to disk and only work on a server with a writable filesystem.
- Run the first-time seed (step 4) from your own machine with the production `DATABASE_URL` and S3 variables set, so the starter banner and category images are uploaded to your bucket.

## 4. First-time data

```bash
SEED_SKIP_CATALOG=true SEED_ADMIN_EMAIL=you@yourdomain.com SEED_ADMIN_PASSWORD='<12+ chars>' npm run db:seed
```

This creates roles and permissions, default settings, shipping zones and tax rates, the first super admin and starter content, without the demo catalogue. Then:

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

- **Vercel** — `vercel.json` already schedules `/api/cron` every 5 minutes. With `CRON_SECRET` set, Vercel sends it as a bearer token. Check your plan's cron frequency limits.
- **Elsewhere** — call it from any scheduler:

  ```bash
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron
  ```

  It returns JSON with `"ok": true`, and 401 without the correct secret.

## 7. Post-deploy checks

- `/` loads and the response carries `Content-Security-Policy` and `Strict-Transport-Security` headers.
- `/robots.txt` and `/sitemap.xml` list your production domain.
- Signed out, `/account` and `/admin` redirect to `/login`.
- Registration sends a verification email that arrives and links to your domain.
- A test-mode order is paid via webhook, appears in **Admin → Orders**, and the confirmation email arrives.
- `/api/cron` returns `ok` when called with the secret.
- Uploading an image in **Admin → Media library** stores it in the bucket and it displays on the storefront.

## Security notes

- Session cookies use the `__Host-` prefix and require HTTPS.
- The CSP allows scripts and frames only from the site itself plus Stripe and PayPal. Adding third-party scripts (analytics, chat) requires updating the CSP in `next.config.ts`.
- Every administrative action is recorded in **Settings → Audit log**.
- Advisories currently reported by `npm audit` affect `mysql2`, pulled in only by the Prisma CLI (a development dependency, unused with PostgreSQL). The suggested `npm audit fix --force` would downgrade Prisma to v6, so do not run it; upgrade Prisma when a patched version is released.
