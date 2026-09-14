# Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Unit | `npm run test:unit` | Nothing |
| Integration | `npm run test:integration` | `npm run db:local` running |
| End-to-end | `npm run test:e2e` | A running, seeded app (see below) |
| Everything | `npm run test:all` | Typecheck, lint, unit + integration, then end-to-end |

`npm test` runs the unit and integration projects together.

## Unit tests — `tests/unit`

Pure logic with no database: the pricing engine (discount allocation, tax, shipping thresholds, rounding) and utilities (money parsing and formatting, slugs).

## Integration tests — `tests/integration`

Real services against a real PostgreSQL database, `TEST_DATABASE_URL` (default `veyora_test` on the local server).

- `global-setup.ts` applies migrations. Each file's setup truncates every table and re-seeds roles, settings, shipping and tax.
- Both refuse to run unless the database name ends in `_test`, so they can never wipe a real database.

Covered:

- **Checkout & payments** — stock reservation; idempotent order placement; unsigned and forged webhooks rejected with no state change; an order becomes paid only after a signed webhook; duplicate deliveries ignored; underpayment refused; failed payments; no overselling when stock drops after items were added to the bag; restock exactly once on cancellation; cash on delivery confirmed but not paid.
- **Coupons** — case-insensitive codes, inactive / expired / not-yet-started / used-up codes, minimum subtotal, customer-restricted codes, usage counted at order placement and enforced on the next order.
- **Authentication** — Argon2id hashing, duplicate email and weak password rejection, identical errors for unknown email and wrong password, lockout, disabled accounts.
- **Import** — dry run writes nothing; re-imports skip unchanged records and update changed ones in place.
- **RBAC** — seeded role permissions (super admin, admin without staff management, manager, customer).

## End-to-end tests — `e2e`

Playwright drives Chromium through 20 flows in 16 tests:

| Spec | Flows |
| --- | --- |
| `auth.setup.ts` | Admin login (saves the session for admin specs) |
| `storefront.spec.ts` | Search (typo tolerance, full results), browse, product page |
| `cart.spec.ts` | Add to cart, update quantity, remove |
| `checkout.spec.ts` | Checkout, sandbox payment, order creation, order tracking; declined payment and retry; coupon created in the admin and applied in the bag |
| `account.spec.ts` | Register (with email verification), review submitted and approved, logout, login |
| `admin.spec.ts` | Product create, product edit (checked on the storefront), inventory update with ledger, order management |

### Running

```bash
npm run test:e2e                                          # reuses or starts the dev server on :3456
PLAYWRIGHT_BASE_URL=http://localhost:3460 npm run test:e2e   # any running server, e.g. `next start -p 3460`
```

The server under test must:

- use the seeded demo catalogue (specs use products such as `amber-wood-wick-candle` and `harness-leather-belt`);
- have `EMAIL_DRIVER=log` — the account spec reads the verification link from `var/mail/mailbox.jsonl`, so the tests must run on the same machine;
- include `sandbox` in `PAYMENT_PROVIDERS` (a production build needs `ALLOW_SANDBOX_PAYMENTS=true`);
- accept the admin credentials in `.env` (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`).

Notes:

- Tests run one at a time because they share one database, the mailbox and rate limits.
- They **create real data** (orders, products, coupons, reviews, a customer) — use a development or disposable database, never production.
- Registration is rate limited to 5 per IP per hour. If you run the suite repeatedly, set `RATE_LIMIT_DRIVER=memory` on the server under test and restart it to reset the limits.
- Failures keep a trace and screenshot in `test-results/`; the HTML report is in `playwright-report/` (`npx playwright show-report`).

## Exploratory QA scripts — `scripts/qa`

Stand-alone Playwright scripts used during development. They print what they observe and save screenshots to `var/qa`:

- guest purchase (`flow.mjs`) and account journey (`account-flow.mjs`)
- an admin route sweep (`admin-sweep.mjs`)
- admin product, operations and people flows

Most need `PW` (the admin password) or a saved admin session; see the header comment in each file.
