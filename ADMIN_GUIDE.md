# Admin guide

The admin lives at `/admin` on the platform site (`www.zendropship.io/admin`). Sign in at `www.zendropship.io/login` with a staff account; customer and store-owner accounts cannot open it. What you see depends on your role: sections you lack permission for are hidden, and the server refuses those actions even if a link is opened directly.

## Roles

| Role | Can do |
| --- | --- |
| **Super admin** | Everything, including staff accounts, roles and permissions |
| **Admin** | Everything except managing staff and roles |
| **Manager** | Dashboard and analytics; view, create, edit and export products; adjust stock; manage categories and brands; moderate reviews; view and update orders; view customers; read messages; manage content and media |
| **Store owner** | Their own store's dashboard at `/dashboard` only — see OWNER_GUIDE.md |
| **Customer** | Shopping in stores only |

Managers cannot delete or import products, refund or cancel orders, change customer accounts, manage coupons, shipping, settings or staff, or view the audit log. **Settings → Staff & roles** can create custom roles from the individual permissions.

## Navigation

| Section | Purpose | Permission |
| --- | --- | --- |
| Dashboard / Analytics | Revenue, orders, customers, top products and categories, low stock, recent orders; 7 / 30 / 90-day and 12-month ranges; each chart has a table view | `dashboard.view` / `analytics.view` |
| Notifications | New orders, payment failures, low stock, new reviews and messages | any staff |
| Stores | Every store with its owner, products, orders and sales; suspend and reopen | `stores.view`, `stores.manage` |
| Orders | Every store's orders; search and filter (including by store); order detail with timeline, payment, shipment and notes | `orders.view` |
| Customers | Search accounts; history, addresses, reviews, activity | `customers.view` |
| Discounts | Coupon codes | `discounts.manage` |
| Messages | Contact form inbox | `messages.view` |
| Products | Catalogue list, editor, bulk actions, CSV export | `products.*` |
| Inventory | Stock per variant, adjustments, ledger | `products.view`, `inventory.update` |
| Categories & brands | Categories, brands, collections, tags, attributes | `catalog.manage` |
| Reviews | Moderation | `reviews.moderate` |
| Import & export | CSV and WooCommerce import, run history | `products.import` |
| Homepage & banners | Homepage sections, banners, menus | `content.manage` |
| Pages & FAQ | Static pages and FAQ | `content.manage` |
| Media library | Images | `media.manage` |
| Settings | Store settings, shipping & tax, staff & roles, audit log | `settings.manage`, `shipping.manage`, `staff.manage`, `audit.view` |

## Stores

Every store opened on the platform is listed under **Stores**, newest first, with its address, owner, live products, orders and sales. Search by store name, address or owner email.

- **Open a store's orders** by clicking its order count — the Orders list filters to that store.
- **Suspend** hides the store from shoppers immediately (its address shows a not-found page) and stops the owner from changing it; the owner can still sign in and see their data. **Reopen** restores it. Both are recorded in the audit log.
- The **platform (demo) store** at `demo.<domain>` has no owner and cannot be suspended here. New catalogue products are added to it automatically; its homepage, banners and announcement come from **Homepage & banners** and **Store settings**. Owner stores reuse the homepage layout with their own name, headline and image, and skip banners that link to departments they don't stock.

**Wholesale cost** (the variant's *cost* field) is what an owner pays when their store sells the item, and the catalogue shows it to prospective owners. Keep it accurate: it decides every owner's margin. **Price** and **sale price** are the suggested retail prices stores use by default. Platform coupons (created under **Discounts**) work only in the platform store, so they never reduce an owner's margin.

Fulfilment is the same for every store: orders from all stores arrive in **Orders** and move through the status flow below; owners see the status and tracking in their dashboard, and their customers get the emails in the store's name.

## Orders

**Status flow.** Orders move forward only:

- Awaiting payment → Confirmed
- Confirmed → Processing, Packed or Shipped
- Processing → Packed or Shipped
- Packed → Shipped
- Shipped → Out for delivery or Delivered
- Out for delivery → Delivered

- **Payment first.** An online order confirms itself when the payment provider's verified confirmation arrives. You can only confirm an unpaid order manually if it is cash on delivery, or after you record a payment received outside the store with **Mark as paid**.
- **Shipping.** Moving to *Shipped* creates the shipment. Add the carrier and tracking number under **Tracking**; customers see them on their order page and in the shipping email.
- **Cancel** is available while an order is Awaiting payment, Confirmed, Processing or Packed. Stock is returned automatically, and a paid order can be refunded in the same step.
- **Refund** issues a full or partial refund through the original provider and records it on the timeline.
- **Notes** are internal unless marked visible to the customer. **Invoice** opens a printable invoice or a PDF.
- Unpaid online orders are cancelled automatically after 2 hours.

## Products

- **Editor.** Name, descriptions (Markdown), images (drag to reorder; the first is the main image), options and variants (price, sale price, cost, SKU, stock, low-stock threshold, weight), specifications, care and shipping notes, SEO fields, status, brand, categories, collections, tags and filter attributes.
- **Status.** *Draft* is hidden from the store, *Active* is live and *Archived* is retired. A sale price must be lower than the regular price.
- **Duplicate** creates a draft copy. **Delete** archives products that appear in past orders, so order history stays intact.
- **Bulk actions.** Select rows to publish, unpublish, feature, change prices by a percentage and/or fixed amount, set stock, archive or delete.
- **Inventory.** Click a stock figure to set a new quantity with a reason. Every change — orders, cancellations, imports, adjustments — appears in the variant's **Ledger** with who made it.

## Catalogue organisation

- **Categories** form departments and subcategories. Drag rows to set their order in navigation. With a keyboard: focus the handle, press Space, move with the arrow keys, then press Space again.
- **Brands** can be featured on the homepage.
- **Collections** are manual (assigned in the product editor) or automatic: new arrivals, on sale, best sellers, top rated, featured.
- **Attributes** either define variants (for example Size) or act as filters (for example Material). Colour values accept a hex swatch, for example `Navy #1f2a44`.
- **Deletion rules.** A category with subcategories can't be deleted, and an attribute used by existing variants can't be deleted.

## Discounts

A coupon can take a percentage off (optionally capped), a fixed amount off or give free shipping. It can apply to the whole order, specific products or categories, and can set:

- a minimum subtotal
- start and end dates
- total and per-customer usage limits
- first order only
- specific customer accounts

Limits are enforced when the order is placed. Deleting a coupon stops the code working; past orders keep their discount.

## Reviews

- **Approve, Reject, Hide or Feature** reviews. Featured reviews can appear on the homepage.
- **Reply** publicly as the store.
- Only approved reviews count towards a product's rating.
- **Settings → Commerce** controls whether reviews need approval, whether only verified purchasers may review, and whether photos are allowed.

## Customers and messages

- **Disable account** signs the customer out everywhere and blocks sign-in; order history is kept.
- **Reset access** ends their sessions and emails a password-reset link; they can't sign in until they set a new password.
- **Messages** from the contact form can be marked *In progress* or *Resolved*; reply from your email client.

## Content

- **Homepage sections.** Add, edit, reorder or hide: hero, trust bar, department grid, product rails (new, trending, best sellers, featured, on sale, optionally limited to a category), promo banners, editorial split, brand strip, reviews and newsletter.
- **Banners.** Hero, promo or editorial placements, with optional mobile image and schedule. In titles, wrap words in `_underscores_` for the italic accent.
- **Menus.** The footer columns use the menus `footer-help`, `footer-company` and `footer-legal`. The header navigation is built from active categories; the bar shows 9 departments and any extras appear under **More**.
- **Pages.** Markdown with headings, lists, tables and links; raw HTML is not rendered. Drafts are not public.
- **FAQ.** Questions are grouped, and drag rows to reorder.
- **Media library.** Uploads (JPEG, PNG, WebP, AVIF, GIF up to 10 MB) are converted to optimised WebP with metadata removed. Add alt text for accessibility and search.

## Settings

- **Store settings** — store name and legal details, support contact, currency and locale, announcement bar, commerce options (guest checkout, return window, reviews, low-stock threshold), SEO defaults and social links.
- **Shipping & tax** — a destination uses the first zone listing its country, and `*` is the rest-of-world fallback. Each method has a price, optional free-shipping threshold and delivery estimate. Prices are shown before tax; a region-specific tax rate overrides the country rate.
- **Staff & roles** — add staff (an existing account with that email is promoted instead) and assign roles. You can only manage people and roles ranked below you, and only grant permissions you hold yourself. Changing someone's role signs them out; removing access turns the account back into a customer account.
- **Audit log** — every administrative and security-relevant action, with actor, time and IP address.

## Good practice

- Give every person their own account and the lowest role that fits their work.
- Remove access promptly when someone leaves.
- Test changes to shipping, tax and coupons with a test order before a sale.
- Review the audit log and low-stock notifications regularly.
