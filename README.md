# Zendropship

A multi-category B2C online store — fashion, beauty, watches, jewellery, bags, tech and home — built with Next.js 16, React 19, TypeScript, Tailwind CSS v4 and PostgreSQL (Prisma 7).

Zendropship started from a review of a reference site. That site turned out to be a fake-seller deposit scheme (seller sign-up with government ID, "distribution" buttons, wallets, deposits and blocked withdrawals), so Zendropship is a **legitimate single-merchant store**: none of those mechanics exist here, and the reference catalogue was not imported. See [REQUIREMENTS.md](REQUIREMENTS.md).

## What's included

**Storefront** — department mega menu, category / brand / collection listings with filters and sorting, typo-tolerant search with suggestions (`/` or ⌘K), product pages with variants, gallery, reviews, related and bought-together products, recently viewed, wishlist, guest and persistent bag (merged at sign-in), coupons, multi-step checkout with shipping zones and tax, order confirmation, guest order tracking, CMS pages, FAQ and contact form.

**Accounts** — registration with email verification, sign-in with lockout and rate limiting, password reset, profile and security settings, address book, order history with fulfilment timeline and payment retry, notifications, reviews.

**Payments** — a provider abstraction with Stripe Checkout, PayPal Orders v2, cash on delivery and a local sandbox gateway. Orders become paid **only** after a verified provider confirmation (signed webhook or verified return); webhook deliveries are stored idempotently.

**Admin** (`/admin`, role-based access enforced on the server) — analytics dashboard, orders (status, tracking, notes, refunds, cancellation with restock, invoices as HTML/PDF), customers (disable, force password reset), products (editor with variants, media and SEO; bulk publish / price / stock; duplicate; archive), inventory with ledger, categories / brands / collections / tags / attributes with drag-and-drop ordering, coupons, review moderation with public replies, contact inbox, staff notifications, homepage sections, banners, menus, pages, FAQ, media library, store settings, shipping and tax, staff and custom roles, audit log, CSV / WooCommerce import and CSV export.

**Operations** — idempotent catalogue importer (CLI and admin), background jobs endpoint (email retries, unpaid-order expiry, cleanup), security headers, sitemap and robots, structured data.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in the secrets — see SETUP.md
npm run db:local            # terminal 1: local PostgreSQL on :5433
npm run db:generate && npm run db:deploy && npm run db:seed
npm run dev                 # terminal 2
```

Full instructions: [SETUP.md](SETUP.md).

## Documentation

| Document | For |
| --- | --- |
| [SETUP.md](SETUP.md) | Running Zendropship locally |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code is organised and why |
| [DATABASE.md](DATABASE.md) | Schema, conventions, migrations and seeding |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment checklist |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Running the store from `/admin` |
| [IMPORT_GUIDE.md](IMPORT_GUIDE.md) | Importing and exporting the catalogue |
| [TESTING.md](TESTING.md) | Unit, integration and end-to-end tests |
| [BRAND.md](BRAND.md) | Visual identity and design tokens |
| [CREDITS.md](CREDITS.md) | Photography and open-source credits |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development server, production build (runs `prisma generate`), production server |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm run db:local` | Embedded PostgreSQL for development (data in `var/postgres`) |
| `npm run db:generate` / `db:migrate` / `db:deploy` | Prisma client generation, create a migration (dev), apply migrations |
| `npm run db:seed` | Roles, settings, shipping and tax, first admin, demo catalogue, content (and demo orders with `SEED_DEMO_DATA=true`) |
| `npm run db:reset` | **Destroys** the database configured in `DATABASE_URL` and re-applies migrations |
| `npm run import:categories` / `import:products` / `import:images` / `import:all` | Catalogue importer — see IMPORT_GUIDE.md |
| `npm run jobs:run` | Runs background jobs once |
| `npm test` / `test:unit` / `test:integration` / `test:e2e` / `test:all` | Test suites — see TESTING.md |

## Verification status

Checked on the development machine with the local database:

- Typecheck and lint clean; production build succeeds (`next build`), and the built app was served with `next start` and smoke-tested (pages, redirects, cron authorisation, security headers).
- 36 unit tests and 30 integration tests pass (pricing, deployment configuration, payment verification, idempotency, stock reservation, coupons, authentication, importer, RBAC).
- The Playwright suite covering 20 customer and admin flows passes against the production build.
- Additional scripted browser QA in `scripts/qa/` (admin sections, customer/admin loops, account journey).

**Not verified** — these are implemented against the providers' documented APIs but have not been exercised with real accounts: Stripe and PayPal payments and refunds, Vercel Blob and S3-compatible storage, SMTP and Resend email delivery. SMS and push notifications exist only as provider interfaces; no provider is implemented. Zendropship has not yet been deployed to a hosting platform.
