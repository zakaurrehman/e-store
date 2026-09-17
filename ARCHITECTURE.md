# Architecture

Zendropship is a single Next.js 16 application (App Router, Turbopack, Cache Components) backed by PostgreSQL through Prisma 7. There is no separate API service: pages and server actions call feature services directly, and Route Handlers exist only where an HTTP endpoint is required (webhooks, cron, uploads, exports, media, search suggestions).

## Repository layout

```
src/
  app/                  routes
    (store)/            storefront, account, checkout (shared store layout)
    admin/              admin area (layout requires a staff session)
    api/                route handlers: payments/webhooks, cron, admin media & export, search suggestions
    media/[...key]/     serves locally stored media
  features/<domain>/    business logic by domain: service.ts (writes), queries.ts (cached reads), actions.ts (server actions), schemas.ts
  server/               infrastructure: db, env, auth, security, payments, storage, email/notifications, jobs, audit
  components/           UI: ui/ primitives, store/, admin/, brand/, seo/
  lib/, utils/          client-safe helpers (permissions catalogue, money, slugs, countries, action state)
  proxy.ts              optimistic auth gate for /account and /admin
db/                     schema.prisma, migrations, seed
scripts/                local database, importer CLI, jobs runner, QA scripts
tests/                  Vitest unit and integration suites
e2e/                    Playwright suite
```

Client components import only from `lib/`, `utils/`, `components/` and client-safe type modules (for example `features/cart/types.ts`). Server-only modules import `server-only`, so a mistaken client import fails the build instead of shipping database code to the browser.

## Rendering and caching

- **Cache Components** is enabled. Catalogue, CMS and settings reads are `"use cache"` functions tagged by entity (`catalog`, `product:<slug>`, `reviews:<productId>`, CMS and settings tags) with `cacheLife`. Pages prerender a static shell and stream per-request parts inside `<Suspense>`.
- **Invalidation.** Admin and customer server actions call `updateTag`, so the person who made a change sees it on their next request. Stock and sales changes that also happen in webhooks, cron and order processing call `revalidateTag(tag, "max")` (stale-while-revalidate) through `features/catalog/invalidate.ts`.
- Request-only endpoints (`/api/cron`, `/sitemap.xml`) call `connection()`, so nothing touches secrets or live data at build time.

## Authentication and authorisation

- Passwords are hashed with Argon2id. Sessions are database rows keyed by the SHA-256 of an opaque, httpOnly cookie token (`__Host-` prefixed in production), valid for 30 days.
- Sign-in has per-account lockout (10 failures → 15 minutes) and per-IP rate limits; unknown emails and wrong passwords return the same error.
- Roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `CUSTOMER`, plus custom roles) map to fine-grained permissions (`src/lib/permissions.ts`). Every admin page calls `requirePagePermission`, and every admin action or route handler calls `assertPermission`. Staff can only manage roles ranked below their own and grant permissions they hold.
- `src/proxy.ts` redirects visitors without a session cookie away from `/account` and `/admin` with a real 307. It never trusts the cookie; the server checks above remain authoritative.

## Orders and payments

1. **Placing an order** (`features/orders/service.ts`) is idempotent on a client-generated key. Inside one transaction it reprices the bag, validates the coupon and counts its use atomically, snapshots addresses and reserves stock with a guarded decrement that cannot go negative.
2. **Payment** goes through the `PaymentProvider` interface (`server/payments`). Redirect providers (Stripe, PayPal, sandbox) return a hosted URL; cash on delivery confirms immediately without marking the order paid.
3. **Confirmation** happens only in `applyPaymentEvent`, reached from a signature-verified webhook (stored in `WebhookEvent`, so duplicate deliveries are acknowledged without side effects) or a server-verified return. An amount lower than the order total is rejected. Frontend redirects never change payment status.
4. **Unpaid orders** are cancelled after 2 hours by the jobs endpoint and their stock is returned exactly once (`inventoryReleased`).
5. Refunds and cancellations record payment transactions, order events and inventory movements.

## Other subsystems

- **Search** — a `SearchProvider` interface; the PostgreSQL implementation uses a weighted `tsvector` document per product plus trigram similarity for typo tolerance and "did you mean" corrections.
- **Media** — uploads are validated, re-encoded to WebP with `sharp` (metadata stripped), de-duplicated by checksum and stored through a `StorageProvider` (local disk served from `/media`, Vercel Blob, or S3-compatible storage).
- **Notifications** — domain events create in-app notifications and an email delivery outbox with retries and backoff. Email drivers: `log`, `smtp`, `resend`. SMS and push are provider interfaces only.
- **Background jobs** — `GET /api/cron` (bearer `CRON_SECRET`) or `npm run jobs:run`: email retries, unpaid-order expiry, cleanup of expired sessions, tokens, guest carts, rate-limit buckets and old webhook events.
- **Rate limiting** — fixed windows in PostgreSQL (single atomic upsert, UTC timestamps), or in memory for tests; fails open on infrastructure errors.
- **Import** — source adapters (CSV, WooCommerce Store API) feed one idempotent runner that maps every external record through `ImportRecord`. See IMPORT_GUIDE.md.
- **Audit log** — administrative and security-relevant actions are written to `AuditLog` with actor, summary and IP.
- **Security headers** — CSP (allowing only Stripe and PayPal frames and form targets), HSTS in production, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies; `X-Powered-By` disabled.

## Error handling

Services throw `DomainError(code, message, { status, fieldErrors })`. Server actions convert them into typed `ActionState` results for forms and toasts, while letting Next.js control-flow errors (redirects, not-found) propagate. Unexpected errors are logged and shown to users as a generic message.
