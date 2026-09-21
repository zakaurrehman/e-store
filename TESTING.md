# Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Unit | `npm run test:unit` | Nothing |
| Integration | `npm run test:integration` | `npm run db:local` running |
| End-to-end | `npm run test:e2e` | A running, seeded app (see below) |
| Everything | `npm run test:all` | Typecheck, lint, unit + integration, then end-to-end |

`npm test` runs the unit and integration projects together.

## Unit tests — `tests/unit`

Pure logic with no database: the pricing engine (discount allocation, tax, shipping thresholds, rounding), store pricing (suggested price, markup with .99 rounding, per-product overrides, margins), tenancy (base domain, host classification, reserved and malformed subdomains, store addresses), utilities (money parsing and formatting, slugs) and deployment configuration (the site URL fallback on Vercel, and the environment check that lists every missing or unsafe setting).

## Integration tests — `tests/integration`

Real services against a real PostgreSQL database, `TEST_DATABASE_URL` (default `veyora_test` on the local server).

- `global-setup.ts` applies migrations. Each file's setup truncates every table and re-seeds roles, settings, shipping and tax, and the platform store the tests shop in.
- Both refuse to run unless the database name ends in `_test`, so they can never wipe a real database.

Covered:

- **Checkout & payments** — stock reservation; idempotent order placement; unsigned and forged webhooks rejected with no state change; an order becomes paid only after a signed webhook; duplicate deliveries ignored; underpayment refused; failed payments; no overselling when stock drops after items were added to the bag; restock exactly once on cancellation; cash on delivery confirmed but not paid.
- **Coupons** — case-insensitive codes, inactive / expired / not-yet-started / used-up codes, minimum subtotal, customer-restricted codes, usage counted at order placement and enforced on the next order.
- **Authentication** — Argon2id hashing, duplicate email and weak password rejection, identical errors for unknown email and wrong password, lockout, disabled accounts.
- **Import** — dry run writes nothing; re-imports skip unchanged records and update changed ones in place.
- **RBAC** — seeded role permissions (super admin, admin without staff management, manager, customer).
- **Wallet** — a crypto deposit is refused without a transaction id or screenshot and records its network; an owner is credited their margin once the customer's payment is collected, and only once even if the payment webhook is replayed; refunds and cancellations reverse it; cash on delivery is credited on delivery; earnings are summarised for today, this week and this month with a running balance in the ledger; a withdrawal is held against the balance, returns when declined and stays gone when paid; a deposit credits nothing until staff confirm it; balances never cross between stores and the platform store earns none.
- **Stores** — opening a store creates a store-owner account and a unique address (reserved addresses and duplicate emails refused, one store per owner); new catalogue products join the platform store, while an owner's store sells only what the owner added; the store's markup and per-product fixed prices drive the bag, and orders keep the store, price and wholesale cost; hidden products can't be bought; platform coupons only work in the platform store and a store's coupon only in that store; suspended stores refuse changes; owners can't change other owners' stores.

## End-to-end tests — `e2e`

Playwright drives Chromium through 23 tests. Storefront specs run in the demo store on its own subdomain (`http://demo.localhost:3456`; Chromium resolves `*.localhost` to your machine); admin and owner steps switch to the platform host (`http://localhost:3456`).

| Spec | Flows |
| --- | --- |
| `auth.setup.ts` | Admin login (saves the session for admin specs) |
| `storefront.spec.ts` | Search (typo tolerance, full results), browse, product page |
| `cart.spec.ts` | Add to cart, update quantity, remove |
| `checkout.spec.ts` | Checkout, sandbox payment, order creation, order tracking; declined payment and retry; coupon created in the admin and applied in the bag |
| `account.spec.ts` | Register (with email verification), review submitted and approved, logout, login |
| `admin.spec.ts` | Product create, product edit (checked on the storefront), inventory update with ledger, order management |
| `platform.spec.ts` | Landing and catalogue with cost/price/margin; opening a store from a product; adding products and setting a markup (checked in the store, including a product the store doesn't sell); a shopper paying in the owner's store with emails in the store's name and an owner alert; the owner's order view with margin; the balance showing the earning, a withdrawal requested by the owner and marked paid by staff; a customer message answered from Customer service with the reply emailed; bags kept separate between stores; the admin suspending and reopening the store |

### Running

```bash
npm run test:e2e                                          # reuses or starts the dev server on :3456
PLAYWRIGHT_BASE_URL=http://localhost:3460 npm run test:e2e   # any running server, e.g. `next start -p 3460` (stores at http://<slug>.localhost:3460)
```

The server under test must:

- use the seeded demo catalogue (specs use products such as `amber-wood-wick-candle` and `harness-leather-belt`);
- have `EMAIL_DRIVER=log` — the account spec reads the verification link from `var/mail/mailbox.jsonl`, so the tests must run on the same machine;
- include `sandbox` in `PAYMENT_PROVIDERS` (a production build needs `ALLOW_SANDBOX_PAYMENTS=true`);
- accept the admin credentials in `.env` (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`).

Notes:

- Tests run one at a time because they share one database, the mailbox and rate limits.
- They **create real data** (orders, products, coupons, reviews, a customer) — use a development or disposable database, never production.
- Registration and store opening are rate limited to 5 per IP per hour. If you run the suite repeatedly, set `RATE_LIMIT_DRIVER=memory` on the server under test and restart it to reset the limits.
- After moving or renaming routes, restart the dev server with a clean `.next/dev` folder: Turbopack's persistent cache can keep a deleted route alive and put the browser into a reload loop.
- Failures keep a trace and screenshot in `test-results/`; the HTML report is in `playwright-report/` (`npx playwright show-report`).

## Exploratory QA scripts — `scripts/qa`

Stand-alone Playwright scripts used during development. They print what they observe and save screenshots to `var/qa`:

- guest purchase (`flow.mjs`) and account journey (`account-flow.mjs`)
- an admin route sweep (`admin-sweep.mjs`)
- admin product, operations and people flows

Most need `PW` (the admin password) or a saved admin session; see the header comment in each file.
