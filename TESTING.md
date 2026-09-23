# Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Unit | `npm run test:unit` | Nothing |
| Integration | `npm run test:integration` | `npm run db:local` running |
| End-to-end | `npm run test:e2e` | A running, seeded app (see below) |
| Everything | `npm run test:all` | Typecheck, lint, unit + integration, then end-to-end |

`npm test` runs the unit and integration projects together.

## Unit tests — `tests/unit`

Pure logic with no database: the pricing engine (discount allocation, tax, shipping thresholds, rounding), store pricing (suggested price, markup with .99 rounding, per-product overrides, margins), tenancy (base domain, host classification, reserved and malformed subdomains, store addresses), utilities (money parsing and formatting, slugs), **order finance** (the brief's $299 example, commission on goods after discount or on margin, no commission on a loss, stored figures read back unchanged, refund shares), **phone numbers** (real numbers normalised to E.164, text, fragments and impossible numbers refused, numbers read against the delivery country, checkout and address schemas), **invitation codes** (random, unique and never sequential, typed forms normalised, used / expired / disabled states), **order statuses** (forward-only, acceptance only through the funding check, customers never told a store is short of funds) and deployment configuration (the site URL fallback on Vercel, and the environment check that lists every missing or unsafe setting).

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
- **Order finance & wallet** — a paid order posts its sale, 10% commission and fulfilment cost exactly once (replayed webhook, retried acceptance and a second charge all change nothing) and the owner keeps goods − wholesale − commission; the commission rate is stored on the order so a later change never rewrites it; commission can be charged on the margin instead; a cash-on-delivery order funds itself from its own pending sale and becomes withdrawable only on delivery; an order that cannot pay for itself waits for funds, a declared deposit changes nothing, a confirmed deposit releases it and four simultaneous acceptance attempts charge it once with one timeline entry; fulfilment steps only move forward; partial and full refunds post proportional compensating entries without touching the originals; cancelling an undelivered cash-on-delivery order unwinds it; withdrawals use only the available balance, move through approved and sending to paid, are refused twice, and four simultaneous requests spend the money once; deposits credit only on confirmation, once even if confirmed twice at the same moment, and keep the decline reason; crypto deposits need proof; earnings for today, this week and this month and the ledger's running balance; balances never cross between stores and the platform store has no ledger.
- **Fulfilment** — an order walks accepted → processing → packed → shipped → out for delivery → delivered with every stage timed and attributed to the staff member who moved it, in order; skipped stages are refused and write nothing, while the jumps the rules allow still work; a cancelled order accepts no further step and leaves nothing charged to the owner; a confirmed order whose own payment covers the cost is accepted without any deposit and charged once; each store sees only its own orders, and the owner's stages match the staff's.
- **Invitations** — no code, blanks and unknown codes refused with nothing created; expired, disabled and used-up codes refused; a valid code accepted however it is typed and linked to the owner and store; three people racing for the last use of a code — one wins; campaign codes with several uses; staff generate and disable codes; signed-in customers need a code, staff do not; turning invitations off in settings.
- **Support** — a customer's message reaches the store owner and staff but not another store; the owner's reply is marked unread for the customer, emailed in the store's name and shown in the customer's inbox; internal notes stay hidden from the customer and the owner; a customer reply reopens the conversation for the store; resolve and reopen; one customer can never see another's conversation, and an order is only linked when it really is theirs; a customer's reply is emailed to the store owner, and platform messages reach only staff.
- **Owner support** — an owner's question to Zendropship carries the whole thread both ways, with each side's unread mark cleared by opening it and the staff reply emailed to the owner; internal notes stay hidden from the owner, and a resolved thread reopens when they write again; a question started from a deposit or a withdrawal shows that payment; one owner can never read another's thread, a store's own customer conversation is not one of these, and the thread still works when the store is suspended.
- **Admin money & payment** — confirming the payment on an order still waiting for it records the money, confirms the order and hands it to fulfilment in one step, with the sale, commission and fulfilment cost on the ledger once each; doing it twice changes nothing; staff putting money into an owner's wallet credits it once, as a deposit the owner can see, with the reason on the record and both steps in the audit log under their name, and the same record cannot be credited twice.
- **Admin deposits & store page** — a declared deposit reaches the queue with the owner's name, email and phone, their store, the reference and the proof, and nothing credited while it waits; it is found by reference, store name or owner email, and the status counts follow; approving credits the amount that actually arrived (not necessarily the declared one) as exactly one ledger entry, with the staff member recorded in the audit log; rejecting keeps the reason and credits nothing; the store page returns the owner, the balance, the deposits, the ledger and a de-duplicated history, never the password hash, and nothing at all for a store that does not exist or was deleted.
- **Branding & confirmation** — each store's context and emails carry its own logo and never another store's (a store without one is named in text); a guest's confirmation link carries a signed token that opens the same order on every load, while a wrong or missing token or another store's address shows nothing; signed-in customers see their order by session and nobody else's; the customer's phone number is stored in international form.
- **Stores** — opening a store creates a store-owner account and a unique address (reserved addresses and duplicate emails refused, one store per owner); new catalogue products join the platform store, while an owner's store sells only what the owner added; the store's markup and per-product fixed prices drive the bag, and orders keep the store, price and wholesale cost; hidden products can't be bought; platform coupons only work in the platform store and a store's coupon only in that store; suspended stores refuse changes; owners can't change other owners' stores.

## End-to-end tests — `e2e`

Playwright drives Chromium through 55 tests. A run clears this machine's own rate-limit buckets first (`e2e/rate-limits.ts`, local databases only) because it opens more accounts in an hour than the production limits allow — the limits themselves are left alone. Storefront specs run in the demo store on its own subdomain (`http://demo.localhost:3456`; Chromium resolves `*.localhost` to your machine); admin and owner steps switch to the platform host (`http://localhost:3456`).

| Spec | Flows |
| --- | --- |
| `auth.setup.ts` | Admin login (saves the session for admin specs) |
| `storefront.spec.ts` | Search (typo tolerance, full results), browse, product page |
| `cart.spec.ts` | Add to cart, update quantity, remove |
| `checkout.spec.ts` | Checkout, sandbox payment, order creation, order tracking; declined payment and retry; coupon created in the admin and applied in the bag |
| `account.spec.ts` | Register (with email verification), review submitted and approved, logout, login |
| `admin.spec.ts` | Product create, product edit (checked on the storefront), inventory update with ledger, moving an order to its next status in one click and seeing it on the fulfilment tracker |
| `admin-actions.spec.ts` | What staff do, with nobody reloading anything: add money to an owner's wallet from the store's page and see it on the owner's balance and deposit history; answer an owner's conversation while the owner has it open and watch the reply appear there; the owner's reply appearing in the open inbox the same way; a storefront customer's open conversation getting the reply live; and an order left awaiting payment by a declined card, confirmed from the queue and walked one step at a time to delivered, with nothing left to press afterwards |
| `navigation.spec.ts` | Every route opened directly, the way a refresh or a pasted link opens it: the public platform pages, a storefront's pages, all of the admin, and a detail page behind each admin list; the cross-host rules (a storefront path on the platform host lands on its platform equivalent, a bag goes to the demo store, an `/s/` path goes to the store's own address, the admin and dashboard are not served on a store host, and a signed-out visitor is sent to sign in rather than a dead end); and the not-found page's own links, which differ on a storefront, on the platform and on an address with no store |
| `deposit-support.spec.ts` | The whole chain in order: an invited owner opens a store, sends money and uploads the screenshot as proof; the deposit waits, credited to nobody; staff find it by reference with the owner's name, email and phone beside it, open the proof, and credit the amount that actually arrived instead of the amount declared; the owner's balance, ledger and deposit history show the credit straight away; the store's admin page gathers the owner, the money, the conversations and the reset action; and the owner then asks about it from the floating button, staff answer in the support inbox, and the reply lands in the same thread |
| `support-widget.spec.ts` | The floating customer-service panel: a visitor who is not signed in writes from the platform site and staff find it in the support inbox with the first line as its subject; the launcher clears the storefront's mobile tab bar and a product page's sticky buy bar, and stays off checkout; the call option is the support phone set in admin settings; a signed-in customer writes from a storefront, staff reply from the inbox, the launcher shows the new reply, and the customer reads and answers it in the panel — one conversation, both ways |
| `platform.spec.ts` | The brief's full scenario: staff create an invitation; opening a store is refused without a valid code and succeeds with it (the code is then marked used and linked to the store); the owner uploads a logo that shows — and loads — in their store but not the demo store; products and a markup (earnings shown after commission); a customer pays, the confirmation survives a refresh and shows the store's logo, and the order's breakdown adds up with commission at 10% of goods; a withdrawal approved and paid by staff; a below-cost cash-on-delivery order lands on a real confirmation page, waits for funds, the owner deposits the shortfall, staff confirm it and the order is accepted with exactly one charge; staff walk it through the queue and the order page — processing, packed, shipped, out for delivery, delivered — with the tracker showing each stage, its time and who moved it, and nothing left to do afterwards; the owner sees the whole timeline and the customer sees it delivered; the ledger shows every kind of movement; a registered customer writes to customer service, staff reply, the customer reads it by email and in their account and writes back; the owner asks Zendropship about a deposit from the balance page, staff answer it in the support inbox with the deposit beside them, the owner is told there is something new and writes back in the same thread; the owner answers their own customers; bags, the owner area and the admin stay private; the store is listed with its balance and invitation and can be suspended and reopened; staff credit the deposit from the deposit queue with the owner beside it; the store's own page gathers the owner, the wallet ledger, the orders and the history; and helping the owner back in sends a reset link — the page never shows a password, and the old one stops working |

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
