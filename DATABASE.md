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
| Identity & access | `User`, `Role`, `Permission`, `RolePermission`, `Session`, `VerificationToken`, `RateLimitBucket`, `Address`, `AuditLog` |
| Catalogue | `Product`, `ProductVariant`, `VariantOptionValue`, `ProductImage`, `ProductCategory`, `ProductAttributeValue`, `ProductTag`, `Category` (tree), `Brand`, `Collection` (manual or rule-based), `CollectionProduct`, `Tag`, `Attribute`, `AttributeValue`, `MediaAsset` |
| Inventory & search | `InventoryMovement`, `SearchDocument` (tsvector + trigram), `SearchQuery`, `SearchHistory` |
| Shopping | `Cart`, `CartItem`, `Wishlist`, `WishlistItem`, `RecentlyViewed` |
| Orders & payments | `Order` (unique `idempotencyKey`), `OrderItem`, `OrderEvent`, `Payment` (unique per provider reference), `PaymentTransaction`, `WebhookEvent` (unique per provider event id), `Shipment` |
| Shipping & tax | `ShippingZone` (country list, `*` = rest of world), `ShippingMethod`, `TaxRate` |
| Promotions & reviews | `Coupon`, `CouponProduct`, `CouponCategory`, `CouponCustomer`, `CouponRedemption`, `Review`, `ReviewImage` |
| Content & messaging | `Setting`, `Page`, `FaqItem`, `Banner`, `HomeSection`, `Menu`, `MenuItem`, `ContactMessage`, `NewsletterSubscriber`, `Notification`, `NotificationDelivery` |
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
5. Demo catalogue — taxonomy, house brands and products with photos (skip with `SEED_SKIP_CATALOG=true`)
6. Content — pages, FAQ, menus, banners and homepage sections
7. Demo orders and reviews — only with `SEED_DEMO_DATA=true`, never in production

For production, run steps 1–4 and 6 with `SEED_SKIP_CATALOG=true`, then import your own catalogue.

## Test database

Integration tests use `TEST_DATABASE_URL` (default `veyora_test`). The test setup applies migrations and truncates every table before each test file, and refuses to run unless the database name ends in `_test`.
