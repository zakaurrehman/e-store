# Architecture

Zendropship is a multi-tenant dropshipping platform in a single Next.js 16 application (App Router, Turbopack, Cache Components) backed by PostgreSQL through Prisma 7. There is no separate API service: pages and server actions call feature services directly, and Route Handlers exist only where an HTTP endpoint is required (webhooks, cron, uploads, exports, media, search suggestions).

## Repository layout

```
src/
  app/                  routes
    (platform)/         platform site on the base domain: landing, /catalog, /start (open a store), sign-in, legal pages
    s/[store]/          a store's storefront, account and checkout — reached through the proxy rewrite, never directly
    dashboard/          store owner's dashboard (layout requires a session with a store)
    admin/              admin area (layout requires a staff session)
    api/                route handlers: payments/webhooks, cron, admin media & export, search suggestions
    media/[...key]/     serves locally stored media
  features/<domain>/    business logic by domain: service.ts (writes), queries.ts (cached reads), actions.ts (server actions), schemas.ts
  server/               infrastructure: db, env, auth, security, payments, storage, email/notifications, jobs, audit
  components/           UI: ui/ primitives, store/, admin/, brand/, seo/
  lib/, utils/          client-safe helpers (permissions catalogue, money, slugs, countries, action state)
  proxy.ts              tenancy (host → platform or store) and the optimistic auth gate
db/                     schema.prisma, migrations, seed
scripts/                local database, importer CLI, jobs runner, QA scripts
tests/                  Vitest unit and integration suites
e2e/                    Playwright suite
```

Client components import only from `lib/`, `utils/`, `components/` and client-safe type modules (for example `features/cart/types.ts`). Server-only modules import `server-only`, so a mistaken client import fails the build instead of shipping database code to the browser.

## Tenancy

- **One deployment, many stores.** `src/proxy.ts` classifies each request's host (`src/lib/tenancy.ts`): the base domain and `www` are the platform site; `<slug>.<base domain>` is a store and is rewritten to `/s/<slug>/…`, so every storefront route receives the store as the `[store]` param. Reserved and malformed subdomains go to the platform site. `x-forwarded-host` wins over `Host`, because Next.js re-fetches server-action redirect targets from its own origin and passes the visitor's host in that header. On development, stores are at `<slug>.localhost:<port>`.
- **Store context.** Pages resolve the store with `storeFromParams` (`features/stores/route.ts`); server actions and route handlers resolve it from the host with `getCurrentStore` (`features/stores/current.ts`). A missing or suspended store renders the not-found page.
- **What is per store.** `StoreProduct` rows are the store's shelf (active flag, optional markup or fixed price). Catalogue queries take a `CatalogScope` (`null` = the platform catalogue, or the store's id and pricing rule) and filter to the shelf; carts (`Cart.storeId`, one per customer per store), orders (`Order.storeId`, `OrderItem.unitCostCents`), coupons (`Coupon.storeId`; platform coupons only work in the platform store) and customer sign-ups (`User.registeredStoreId`) carry the store.
- **What is shared.** Products, variants, stock, categories, brands, reviews, shipping zones, tax, CMS pages and fulfilment belong to the platform. User accounts are platform-wide, but sessions and bags are per host because cookies are.
- **Pricing** (`features/stores/pricing.ts`, pure and shared with the client): a variant has a wholesale `costCents` and a suggested `priceCents`/`salePriceCents`. A store sells at the suggested price (default) or at wholesale plus its markup, rounded to .99; a product can override with its own markup or a fixed price. Carts and orders are always priced this way on the server; listings sort and filter by the suggested price.
- **Owners.** `/start` creates a `STORE_OWNER` account and its `Store` in one transaction (`features/stores/onboarding.ts`). Every dashboard page calls `requireStoreOwner`, and every owner action calls `assertStoreOwner` and passes the owner's id to the store service, which refuses stores the caller does not own.

## Rendering and caching

- **Cache Components** is enabled. Catalogue, CMS and settings reads are `"use cache"` functions tagged by entity (`catalog`, `product:<slug>`, `reviews:<productId>`, CMS and settings tags) with `cacheLife`. Store-scoped reads also carry `store-catalog:<storeId>`, and the store record `store:<slug>`; owner actions update those two tags, so their changes show in their store immediately. Pages prerender a static shell and stream per-request parts inside `<Suspense>`.
- **Invalidation.** Admin and customer server actions call `updateTag`, so the person who made a change sees it on their next request. Stock and sales changes that also happen in webhooks, cron and order processing call `revalidateTag(tag, "max")` (stale-while-revalidate) through `features/catalog/invalidate.ts`.
- Request-only endpoints (`/api/cron`, `/sitemap.xml`) call `connection()`, so nothing touches secrets or live data at build time.

## Authentication and authorisation

- Passwords are hashed with Argon2id. Sessions are database rows keyed by the SHA-256 of an opaque, httpOnly cookie token (`__Host-` prefixed in production), valid for 30 days.
- Sign-in has per-account lockout (10 failures → 15 minutes) and per-IP rate limits; unknown emails and wrong passwords return the same error.
- Roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `STORE_OWNER`, `CUSTOMER`, plus custom roles) map to fine-grained permissions (`src/lib/permissions.ts`). Every admin page calls `requirePagePermission`, and every admin action or route handler calls `assertPermission`. Staff can only manage roles ranked below their own and grant permissions they hold.
- `src/proxy.ts` redirects visitors without a session cookie away from `/account` (stores), `/dashboard` and `/admin` (platform) with a real 307. It never trusts the cookie; the server checks above remain authoritative.

## Orders and payments

1. **Placing an order** (`features/orders/service.ts`) is idempotent on a client-generated key. Inside one transaction it reprices the bag, validates the coupon and counts its use atomically, snapshots addresses and reserves stock with a guarded decrement that cannot go negative.
2. **Payment** goes through the `PaymentProvider` interface (`server/payments`). Redirect providers (Stripe, PayPal, sandbox) return a hosted URL; cash on delivery confirms immediately without marking the order paid.
3. **Confirmation** happens only in `applyPaymentEvent`, reached from a signature-verified webhook (stored in `WebhookEvent`, so duplicate deliveries are acknowledged without side effects) or a server-verified return. An amount lower than the order total is rejected. Frontend redirects never change payment status.
4. **Unpaid orders** are cancelled after 2 hours by the jobs endpoint and their stock is returned exactly once (`inventoryReleased`).
5. Refunds and cancellations record payment transactions, order events and inventory movements.
6. **Money** is worked out in one place, `features/finance/order-finance.ts` (pure, client-safe): goods sold, fulfilment cost, commission and owner earning. `placeOrder` stores the result — including the commission rate and base in force — on the order, and every screen reads the stored figures.
7. **Ledger and funding** (`features/wallet/service.ts`). When the order is confirmed, its sale and commission are posted, and the order waits: `acceptOrder` (`features/orders/service.ts`) is the only code that makes an order Accepted, and only when its store's owner presses Accept (staff, for the platform's own store) — nothing calls it on payment, webhook, deposit or job, and `updateOrderStatus` refuses ACCEPTED. It locks the order row, checks who is accepting, and sets the fulfilment cost aside through `chargeOrderFulfilment`, whose `fundingPlan` splits it: the part the customer's collected payment covers is posted `PENDING` with the order, and the rest (all of it for cash on delivery, which has collected nothing) is taken from the owner's *available* balance at once as a `CLEARED` entry, so it cannot be spent twice. Each posting carries an idempotency key and is written under a per-store PostgreSQL advisory lock (`pg_advisory_xact_lock`), and acceptance also locks the order row, so retries, duplicate webhooks and simultaneous clicks cannot post twice. If the available balance cannot cover its part it throws, so the whole transaction — status, events and postings — rolls back and the order keeps waiting; otherwise it records ACCEPTED and moves the order to PROCESSING in the same transaction. `AWAITING_FUNDS` is no longer set; orders left in it wait for the owner like CONFIRMED ones. An order's entries stay `PENDING` until it is delivered, whatever the payment method: `settleDeliveredOrder` clears them inside the transaction that marks it `DELIVERED`, posting nothing new, so earnings become withdrawable exactly once and only then. Withdrawals (USDT TRC20 only, addresses verified by base58check in `features/wallet/tron.ts`) draw only on cleared money. Refunds and cancellations post proportional compensating entries per status, so held money is unwound as held and set-aside money comes straight back to the available balance.

## Other subsystems

- **Search** — a `SearchProvider` interface; the PostgreSQL implementation uses a weighted `tsvector` document per product plus trigram similarity for typo tolerance and "did you mean" corrections.
- **Media** — uploads are validated, re-encoded to WebP with `sharp` (metadata stripped), de-duplicated by checksum and stored through a `StorageProvider` (local disk served from `/media`, Vercel Blob, or S3-compatible storage).
- **Invitations** — `features/referrals`: random `ZD-` codes; a use is claimed with a conditional increment inside the transaction that creates the owner and store, and the redemption links code, owner and store.
- **Support** — `features/support`: `ContactMessage` is a conversation and `ContactReply` each later turn (customer, store or staff, or an internal note). Every query is scoped server-side — a customer by their own user id and the current store, an owner by their store, staff by permission — so ids from the browser are never trusted.
- **Phone numbers** — `lib/phone.ts` wraps libphonenumber: validation against the delivery country and E.164 storage, shared by the checkout and address schemas.
- **Notifications** — domain events create in-app notifications and an email delivery outbox with retries and backoff. Customer emails use the store's name, logo and support address and link to the store's own domain; each new order also emails the store's owner, and money events (awaiting funds, order accepted, deposits and withdrawals settled) notify owners and staff. Email drivers: `log`, `smtp`, `resend`. SMS and push are provider interfaces only.
- **Background jobs** — `GET /api/cron` (bearer `CRON_SECRET`) or `npm run jobs:run`: email retries, unpaid-order expiry, cleanup of expired sessions, tokens, guest carts, rate-limit buckets and old webhook events.
- **Rate limiting** — fixed windows in PostgreSQL (single atomic upsert, UTC timestamps), or in memory for tests; fails open on infrastructure errors.
- **Import** — source adapters (CSV, WooCommerce Store API) feed one idempotent runner that maps every external record through `ImportRecord`. See IMPORT_GUIDE.md.
- **Audit log** — administrative and security-relevant actions are written to `AuditLog` with actor, summary and IP.
- **Security headers** — CSP (allowing only Stripe and PayPal frames and form targets), HSTS in production, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies; `X-Powered-By` disabled.

## Error handling

Services throw `DomainError(code, message, { status, fieldErrors })`. Server actions convert them into typed `ActionState` results for forms and toasts, while letting Next.js control-flow errors (redirects, not-found) propagate. Unexpected errors are logged and shown to users as a generic message.
