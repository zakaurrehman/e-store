# Database

PostgreSQL 15 or newer, accessed through Prisma 7 with the `@prisma/adapter-pg` driver adapter.

- Schema: `db/schema.prisma`
- Migrations: `db/migrations`
- Prisma configuration: `prisma.config.ts` (reads `DATABASE_URL`)
- Generated client: `src/generated/prisma` (not committed; created by `npm run db:generate` and by `npm run build`)
- Required extensions (created by the first migration): `pg_trgm`, `unaccent`

## Conventions

- **Money** is stored as integer minor units (`priceCents`, `totalCents`, `rateBps` for tax rates in basis points). All arithmetic happens in integers in `features/checkout/pricing.ts`.
- **Timestamps** are UTC. Prisma writes `DateTime` values as UTC `timestamp` columns, and every connection pins `TimeZone=UTC` so raw SQL `now()` agrees regardless of the server's time zone.
- **Soft deletion** (`deletedAt`) is used where history must survive: users, products, categories, brands, collections, coupons, pages, reviews. Products that appear in orders are archived rather than deleted.
- **Snapshots** — orders copy addresses, product names, SKUs and prices at purchase time, so later catalogue edits never change past orders.
- **Denormalised read model** — `Product` keeps `priceCents`, `maxPriceCents`, `compareAtPriceCents`, `onSale`, `inStock`, `totalStock`, `ratingAverage`, `ratingCount` and `salesCount`, recalculated from variants, reviews and paid orders whenever they change.
- **Ledgers** — every stock change writes an `InventoryMovement` with its reason and resulting balance; every payment event writes a `PaymentTransaction`; order history is an append-only `OrderEvent` timeline.

## Models by area

| Area | Models |
| --- | --- |
| Identity & access | `User` (`registeredStoreId` = the store a customer signed up in), `Role`, `Permission`, `RolePermission`, `Session`, `VerificationToken`, `RateLimitBucket`, `Address`, `AuditLog` |
| Stores | `Store` (unique `slug` = subdomain; one per owner, `ownerId` null for the platform's demo store; status, pricing rule, branding, reserved `customDomain` and `stripeAccountId`), `StoreProduct` (the store's shelf: active flag, optional markup or fixed price; unique per store and product) |
| Store wallet | `WalletEntry` (append-only ledger; the balance is its sum. Each order posts `ORDER_SALE`, `ORDER_COMMISSION` and `ORDER_FULFILMENT` once — enforced by a unique `idempotencyKey` and a per-store advisory lock; refunds and cancellations add `ORDER_REFUND`, `COMMISSION_REVERSAL` and `FULFILMENT_REVERSAL` lines. `status` is `PENDING` until the customer's money is collected, then `CLEARED`; only cleared money can be withdrawn. `ORDER_EARNING`/`ORDER_REVERSAL` are single net lines from before sales and costs were recorded separately), `Payout` (withdrawal: requested → approved → processing → paid, or rejected; the amount is held out of the available balance from the request), `Deposit` (transfer an owner declares — bank or crypto, with network, reference and an optional proof image; credited only when staff confirm it) |
| Invitations | `ReferralCode` (random `ZD-` code, `maxUses` null = unlimited, `usedCount`, expiry, active flag, author), `ReferralRedemption` (who used a code and the store it opened; unique per code and user) |
| Catalogue | `Product`, `ProductVariant`, `VariantOptionValue`, `ProductImage`, `ProductCategory`, `ProductAttributeValue`, `ProductTag`, `Category` (tree), `Brand`, `Collection` (manual or rule-based), `CollectionProduct`, `Tag`, `Attribute`, `AttributeValue`, `MediaAsset` |
| Inventory & search | `InventoryMovement`, `SearchDocument` (tsvector + trigram), `SearchQuery`, `SearchHistory` |
| Shopping | `Cart` (belongs to a store; unique per customer and store), `CartItem`, `Wishlist`, `WishlistItem`, `RecentlyViewed` |
| Orders & payments | `Order` (belongs to a store; unique `idempotencyKey`; stores its own money breakdown — `fulfilmentCostCents`, `commissionRateBps`, `commissionBase`, `commissionCents`, `ownerEarningCents` — fixed when the order is placed, and `acceptedAt` when fulfilment took it; statuses include `AWAITING_FUNDS` and `ACCEPTED`), `OrderItem` (keeps `unitPriceCents` and the wholesale `unitCostCents`), the order's `OrderEvent`s are its timeline, `OrderEvent`, `Payment` (unique per provider reference), `PaymentTransaction`, `WebhookEvent` (unique per provider event id), `Shipment` |
| Shipping & tax | `ShippingZone` (country list, `*` = rest of world), `ShippingMethod`, `TaxRate` |
| Promotions & reviews | `Coupon` (`storeId` null = platform coupon, usable only in the platform store), `CouponProduct`, `CouponCategory`, `CouponCustomer`, `CouponRedemption`, `Review`, `ReviewImage` |
| Content & messaging | `Setting`, `Page`, `FaqItem`, `Banner`, `HomeSection`, `Menu`, `MenuItem`, `ContactMessage` (a support conversation: the store it was sent to — null = Zendropship itself — the customer account and order it is about when known, assignee, status, unread flags for each side, `lastMessageAt`), `ContactReply` (each later turn: from the customer, from the store or staff, or an internal note), `NewsletterSubscriber`, `Notification`, `NotificationDelivery` |
| Import | `ImportRun`, `ImportRecord` |

## Commands

| Command | Use |
| --- | --- |
| `npm run db:local` | Start the embedded development server on port 5433 (`var/postgres`) |
| `npm run db:migrate` | Create and apply a new migration after editing the schema (development only) |
| `npm run db:deploy` | Apply pending migrations (CI, staging, production) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:seed` | Seed or update base data (idempotent) |
| `npm run db:studio` | Browse data with Prisma Studio |
| `npm run db:reset` | **Drops all data** in `DATABASE_URL` and re-applies migrations — development only |

## Seeding

`db/seed/index.ts` runs these idempotent steps:

1. Permissions and system roles
2. Store settings (defaults are added without overwriting edits)
3. Shipping zones, methods and tax rates
4. The first super admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (skipped when unset; an existing password is never changed)
5. Demo catalogue — taxonomy, house brands and products with photos, with sample wholesale costs at 55% of the selling price (skip with `SEED_SKIP_CATALOG=true`)
6. The platform's demo store (address `demo`), stocked with every active product the first time
7. Content — pages, FAQ, menus, banners and homepage sections
8. Demo orders and reviews in the demo store — only with `SEED_DEMO_DATA=true`, never in production

For production, run the seed with `SEED_SKIP_CATALOG=true`, then import your own catalogue with real wholesale costs.

Two later migrations extend this: `20260921090000_store_support` gives contact messages a store and adds the reply thread (existing messages go to the platform store), and `20260921120000_store_wallet` adds the wallet, crediting every order whose payment had already been collected so existing owners start with the right balance.

The `stores` migration (`20260919120407_stores`) upgrades a database from the single-store version in place: it creates the store-owner role and the `stores.*` permissions, creates the demo store with every existing product, assigns existing carts and orders to it, snapshots wholesale cost on existing order lines, and fills missing variant costs at 55% of the selling price.

## Test database

Integration tests use `TEST_DATABASE_URL` (default `veyora_test`). The test setup applies migrations and truncates every table before each test file, and refuses to run unless the database name ends in `_test`.
