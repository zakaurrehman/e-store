# Zendropship

A dropshipping platform: anyone can open an online store in a minute, fill it with products from the Zendropship catalogue, and sell under their own name. Customers buy in the owner's store; every order goes straight to Zendropship fulfilment, which packs and ships it. Built with Next.js 16, React 19, TypeScript, Tailwind CSS v4 and PostgreSQL (Prisma 7).

- **Platform site** — `zendropship.io`: landing page, the product catalogue (with wholesale price, suggested price and margin on every product), "Create your store", owner sign-in, the owner dashboard and the Zendropship admin.
- **Stores** — `<name>.zendropship.io`: a complete storefront per owner, showing only the products that owner added, at that owner's prices, under that owner's name and colours. A platform-run demo store lives at `demo.zendropship.io`.

The platform grew out of a review of a reference site that turned out to be a fake-seller deposit scheme. Zendropship now has a wallet, deposits and invitation codes, under rules that keep the line that matters: an order is paid for by its own customer's payment, so an owner deposits only to cover a genuine shortfall (an item priced below cost); withdrawals never depend on a deposit or on contacting support; and nothing credits money except a collected payment or a deposit staff have confirmed. See [REQUIREMENTS.md](REQUIREMENTS.md), Version 3.

## What's included

**Platform** — landing page, public catalogue with department browsing, filters and search, "Add to my store" (a visitor who picks a product first gets it added when their store opens), one-step store opening with a live address check, owner sign-in and password reset on the platform.

**Owner dashboard** (`/dashboard`) — overview with balance (available and on its way), earnings for today/this week/this month, orders by state (including awaiting funds), where the money goes (customer sales, fulfilment cost, commission, earnings) and a setup checklist; every order's breakdown and timeline; a balance page with the full ledger, withdrawals (requested → approved → being sent → paid) and deposits (bank transfer or crypto, with a screenshot as proof); the store's products with wholesale / selling price / margin and per-product pricing (store rule, own markup or fixed price), show/hide and remove; orders with fulfilment status and per-order margin; customers; customer service (conversations with the store's customers, with unread marks, search and replies emailed in the store's name, plus the owner's own questions to Zendropship); design and details (name, tagline, logo, homepage image and text, accent colour, announcement, support email); store-wide pricing (suggested prices or a markup); and a payments page that states plainly what is and is not available yet.

**Stores** — department mega menu limited to what the store stocks, category / brand / collection listings with filters and sorting, typo-tolerant search, product pages with variants, gallery, reviews, related products, recently viewed, wishlist, a bag per store (merged at sign-in), coupons scoped to the store, multi-step checkout with shipping zones and tax, an order confirmation page that works for guests, on refresh and on mobile, order tracking, customer accounts, **customer service** (conversations the customer follows in their account), CMS pages, FAQ and contact form. Phone numbers are validated for the delivery country and stored in international form. Customer emails go out in the store's name and link back to the store's own address.

**Automation** — orders are recorded with the price paid and the wholesale cost and go straight to fulfilment; stock and catalogue prices are read live, so stores never sell what cannot ship; customers receive confirmation, shipping and delivery emails; the owner is emailed on every sale and every customer message; each sale posts its sale, Zendropship's commission (10% by default, configurable, fixed on the order) and the fulfilment cost to the owner's ledger exactly once, and refunds post compensating entries; an order that cannot pay for itself waits for funds and goes to fulfilment when a deposit is confirmed; new catalogue products appear in the demo store automatically.

**Payments** — a provider abstraction with Stripe Checkout, PayPal Orders v2, cash on delivery and a local sandbox gateway. Orders become paid **only** after a verified provider confirmation (signed webhook or verified return). Payouts to owners through their own Stripe accounts (Stripe Connect) are **not built yet**.

**Admin** (`/admin`, role-based access enforced on the server) — everything from the single-store version (orders, customers, products, inventory, catalogue organisation, coupons, reviews, messages, content, media, settings, shipping and tax, staff and roles, audit log, import/export) plus **Stores** (every store with its owner, products, orders and sales, with suspend and reopen) **Withdrawals** (owners' balances: withdrawals to approve and send, deposits to confirm with their proof), **Invitations** (generate, disable and trace invitation codes), a **support inbox** (every conversation, with assignment, internal notes and resolve), every order's money breakdown and wallet movements, and commission settings.

**Operations** — idempotent catalogue importer (CLI and admin), background jobs endpoint, security headers, per-host sitemap and robots, structured data.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in the secrets — see SETUP.md
npm run db:local            # terminal 1: local PostgreSQL on :5433
npm run db:generate && npm run db:deploy && npm run db:seed
npm run dev -- -p 3456      # terminal 2
```

Open `http://localhost:3456` for the platform and `http://demo.localhost:3456` for the demo store (browsers resolve `*.localhost` to your machine). A store you open locally is at `http://<address>.localhost:3456`.

Full instructions: [SETUP.md](SETUP.md).

## Documentation

| Document | For |
| --- | --- |
| [SETUP.md](SETUP.md) | Running Zendropship locally |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code is organised and why, including tenancy |
| [DATABASE.md](DATABASE.md) | Schema, conventions, migrations and seeding |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment checklist, including store subdomains |
| [OWNER_GUIDE.md](OWNER_GUIDE.md) | Opening and running a store |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Running the platform from `/admin` |
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
| `npm run db:seed` | Roles, settings, shipping and tax, first admin, demo catalogue, the demo store, content (and demo orders with `SEED_DEMO_DATA=true`) |
| `npm run db:reset` | **Destroys** the database configured in `DATABASE_URL` and re-applies migrations |
| `npm run import:categories` / `import:products` / `import:images` / `import:all` | Catalogue importer — see IMPORT_GUIDE.md |
| `npm run jobs:run` | Runs background jobs once |
| `npm test` / `test:unit` / `test:integration` / `test:e2e` / `test:all` | Test suites — see TESTING.md |

## Verification status

Checked on the development machine with the local database (2026-09-21):

- Typecheck and lint clean; production build succeeds (`next build`).
- 78 unit tests and 66 integration tests pass, including the order money breakdown and commission rules, the ledger (exactly-once sale, commission and fulfilment postings under concurrent attempts, proportional refunds, pending cash on delivery, withdrawals and deposits that cannot double-spend), the funding gate, invitation codes (including a race for the last use), support conversations and their privacy, per-store logos in emails, the guest confirmation link, and phone validation.
- The Playwright suite (29 tests) passes against the development server, including the brief's full scenario: staff invite an owner, the owner opens and brands a store, prices products, a customer pays, the breakdown adds up, a below-cost order waits for funds, a confirmed deposit releases it with exactly one charge, staff take it to delivered, owner and customer follow the timeline, and customer service runs between customer, store and staff.

**Not verified or not built** — Stripe and PayPal payments and refunds have not been exercised with real accounts; Vercel Blob / S3 storage and SMTP / Resend delivery are implemented but unverified with real accounts; SMS and push are interfaces only. **Stripe Connect payouts to owners, owner-created coupons, custom domains for stores, and scheduled supplier-feed sync are not built yet.** Store subdomains in production need the wildcard domain set up first — see DEPLOYMENT.md.
