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
| Withdrawals | Owners' balances: withdrawals to send and deposits to confirm | `stores.view`, `stores.manage` |
| Invitations | Invitation codes for opening a store: generate, disable, see who used each one | `stores.view`, `stores.manage` |
| Orders | Every store's orders; search and filter (including by store); order detail with timeline, payment, shipment and notes | `orders.view` |
| Customers | Search accounts; history, addresses, reviews, activity | `customers.view` |
| Discounts | Coupon codes | `discounts.manage` |
| Support inbox | Every support conversation on the platform: reply, assign, internal notes, resolve | `messages.view` |
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

## Withdrawals and deposits

Each owner has a balance kept as an append-only ledger — no screen writes a balance directly. Every order posts three lines: the **sale** (what the customer paid for the goods), Zendropship's **commission**, and the **fulfilment cost** (wholesale). Deposits, withdrawals and corrections are lines too. Lines for money not yet collected (cash on delivery before delivery) are *pending*; only cleared money can be withdrawn.

- **Withdrawals to send.** An owner asks to withdraw; the amount leaves their available balance straight away. **Approve** it once the details check out, **Sending** when the transfer is on its way, then **Mark paid** (add the bank reference if you have one). **Decline** returns the amount to their balance and tells them why. Payouts are sent by hand — nothing is paid out automatically.
- **Deposits to confirm.** An owner records a transfer they say they have made, by bank transfer or crypto, with a reference or transaction id and usually a screenshot (click the thumbnail to see it full size). **Confirm only when the money is in the Zendropship account or wallet** — confirming is what credits their balance. For crypto, check the transaction on the blockchain: a screenshot proves nothing on its own. **Decline** credits nothing.
- **Where owners send money** is set in **Settings → Owner deposits**: bank details, crypto network and wallet address, and the instructions shown in the deposit form. Leave the wallet address empty to hide the crypto option. Check the address character by character whenever you change it, and consider your obligations around accepting crypto (identity checks, sanctions screening and record keeping) before you publish one.
- **Owed to owners** at the top is the total of every store balance, which is the money the platform holds on their behalf.

Confirming a deposit also releases any of that owner's orders that were **Awaiting funds**: they go to fulfilment on their own, charged once.

## Commission

**Settings → Commission & invitations** sets Zendropship's commission: the rate in basis points (1000 = 10%) and what it is charged on — the goods sold after discount (default; shipping and tax are never included) or the owner's margin. The rule in force is **stored on each order when it is placed**, so changing it only affects new orders. Every order page shows the full breakdown: customer paid, shipping & tax, goods sold, fulfilment cost, commission and what the owner earns, plus the wallet movements the order caused.

## Invitations

Opening a store is invite-only while **Stores are invitation-only** is ticked in Settings → Commission & invitations (on by default).

- **Invitations → Generate codes**: how many, uses per code (single use, or more for a campaign), an optional expiry and a label so you remember who it was for. Codes look like `ZD-7K4P9X2M` and are random — they cannot be guessed.
- The list shows each code's state (available, used, expired, disabled), how often it has been used, and the owner and store it opened. **Disable** stops a code working; **Enable** turns it back on.
- Staff can open a store without a code. A code is claimed in the same transaction that creates the store, so two people cannot share the last use.

## Orders

**Status flow.** Orders move forward only:

- Awaiting payment → Confirmed
- Confirmed → Accepted (or Awaiting funds → Accepted)
- Accepted → Processing, Packed or Shipped
- Processing → Packed or Shipped
- Packed → Shipped
- Shipped → Out for delivery or Delivered
- Out for delivery → Delivered

- **Payment first.** An online order confirms itself when the payment provider's verified confirmation arrives; cash on delivery confirms at once. **Mark as paid** records a payment received outside the store.
**Working the queue.** **Orders → To fulfil** lists everything still to be dealt with, and every row shows what it is waiting for (`Next: Packed`) and a button for that step — accept, processing, packed, shipped, out for delivery, delivered — so an order can be moved on without opening it. Steps that tell the customer (shipped, delivered) ask for confirmation first. The order page has the same button, a **Skip ahead** dialog for the jumps the rules allow (accepted straight to shipped, say), and a **Fulfilment** panel showing every stage with its time and whoever moved it. Once an order is delivered the workflow is finished: no step is offered and the page says so.

- **Accepting for fulfilment** charges the wholesale cost to the owner's balance, exactly once however often it is tried. It happens automatically as soon as an order is confirmed. The order's own payment counts towards it, so a normally priced order needs no deposit and the page says as much before you accept. If the balance still cannot cover it — normally because the owner sells below cost — the order becomes **Awaiting funds**, the owner is emailed the shortfall, and it is accepted automatically when you confirm a deposit that covers it. **Accept for fulfilment** on the order page retries by hand. Orders in Zendropship's own store are never charged.
- **Shipping.** Moving to *Shipped* creates the shipment. Add the carrier and tracking number under **Tracking**; customers see them on their order page and in the shipping email.
- **Cancel** is available while an order is Awaiting payment, Confirmed, Awaiting funds, Accepted, Processing or Packed. Stock is returned automatically, a paid order can be refunded in the same step, and the owner's ledger is unwound with compensating entries.
- **Refund** issues a full or partial refund through the original provider and records it on the timeline. The owner's sale, fulfilment cost and commission are reversed in proportion to the amount refunded.
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
- **Support inbox** holds every conversation: messages to Zendropship (including owners' own questions) and messages in owners' stores. Filter by where it came from (*To Zendropship*, *In owners' stores*, *Assigned to me*) and by status, and search by subject, customer, order number or store. A dot marks unread conversations; opening one marks it read.
- Open a conversation to see the customer, whether they have an account, the store and the order it is about (linked only if the order really is theirs). **Assign** it to a colleague, **reply** — the customer gets it by email and, if signed in, in their account — or tick **Internal note** to leave a note only staff can see. A customer writing back reopens the conversation.

## Content

- **Homepage sections.** Add, edit, reorder or hide: hero, trust bar, department grid, product rails (new, trending, best sellers, featured, on sale, optionally limited to a category), promo banners, editorial split, brand strip, reviews and newsletter.
- **Banners.** Hero, promo or editorial placements, with optional mobile image and schedule. In titles, wrap words in `_underscores_` for the italic accent.
- **Menus.** The footer columns use the menus `footer-help`, `footer-company` and `footer-legal`. The header navigation is built from active categories; the bar shows 9 departments and any extras appear under **More**.
- **Pages.** Markdown with headings, lists, tables and links; raw HTML is not rendered. Drafts are not public.
- **FAQ.** Questions are grouped, and drag rows to reorder.
- **Media library.** Uploads (JPEG, PNG, WebP, AVIF, GIF up to 10 MB) are converted to optimised WebP with metadata removed. Add alt text for accessibility and search.

## Settings

- **Store settings** — store name and legal details, support contact, currency and locale, **commission and invitations**, announcement bar, commerce options (guest checkout, return window, reviews, low-stock threshold), SEO defaults, owner deposit details and social links.
- **Shipping & tax** — a destination uses the first zone listing its country, and `*` is the rest-of-world fallback. Each method has a price, optional free-shipping threshold and delivery estimate. Prices are shown before tax; a region-specific tax rate overrides the country rate.
- **Staff & roles** — add staff (an existing account with that email is promoted instead) and assign roles. You can only manage people and roles ranked below you, and only grant permissions you hold yourself. Changing someone's role signs them out; removing access turns the account back into a customer account.
- **Audit log** — every administrative and security-relevant action, with actor, time and IP address.

## Good practice

- Give every person their own account and the lowest role that fits their work.
- Remove access promptly when someone leaves.
- Test changes to shipping, tax and coupons with a test order before a sale.
- Review the audit log and low-stock notifications regularly.
