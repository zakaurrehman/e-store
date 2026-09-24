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
| Stores | Every store with its owner, products, orders and sales; suspend and reopen. Opening a store shows the owner's account, the store, its wallet ledger, deposits, orders and history on one page | `stores.view`, `stores.manage` |
| Deposits | Deposit requests from owners: who sent what, the proof they attached, and approve-and-credit or reject | `stores.view`, `stores.manage` |
| Withdrawals | Owners' balances and the withdrawals waiting to be sent | `stores.view`, `stores.manage` |
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

Each owner has a balance kept as an append-only ledger — no screen writes a balance directly. Every order posts three lines: the **sale** (what the customer paid for the goods), Zendropship's **commission**, and the **fulfilment cost** (wholesale). Deposits, withdrawals and corrections are lines too. An order's lines are *held* until the order is **delivered**, whatever the payment method, so an owner's earnings become withdrawable only on delivery; the only order money that leaves the available balance earlier is a cost set aside from it at acceptance (see *Accepting* below). Only available money can be withdrawn.

- **Withdrawals to send.** Owners withdraw in **USDT on the TRON (TRC20) network** only; the address they give is checked, checksum included, before the request is accepted. The amount leaves their available balance straight away. **Approve** it once the details check out, **Sending** when the transfer is on its way, then **Mark paid**: the dialog shows the owner's TRC20 address with a copy button for Binance (choose the TRON network there), and takes the transfer's **TxID**, which the owner then sees beside the withdrawal linked to Tronscan. **Decline** returns the amount to their balance and tells them why. Payouts are sent by hand — nothing is paid out automatically. Withdrawals made earlier by bank transfer or PayPal keep their method in the history.
- **Deposit requests** have their own screen. Each row carries the owner's name, email and phone, their store, the amount, the method and reference, the proof they uploaded (click it to see it full size) and when they submitted it. Filter by *Pending*, *Approved* or *Rejected*, or search by owner, store or reference.
- **Approve & credit** opens the proof beside the figures and asks for the amount to credit — prefilled with what the owner declared, editable when a different amount actually arrived. Pressing it credits their wallet as **one ledger entry** and records who approved it and when. It accepts none of their orders — the confirmation tells you how many are waiting for the owner to accept. Nothing is credited before that; approving is the only thing that moves money. **Reject** asks for a reason, credits nothing, and tells the owner.
- **Confirm only when the money is in the Zendropship account or wallet.** For crypto, check the transaction on the blockchain: a screenshot proves nothing on its own. A **Binance · USDT (TRC20)** deposit carries its TxID, and both the queue and the review dialog link it to Tronscan — check that it went to your address, in USDT, for the amount you credit.
- **Where owners send money** is set in **Settings → Owner deposits**: the **Binance USDT (TRC20) deposit address** (offered to owners first, with step-by-step Binance instructions), bank details, any other crypto network and wallet address, and the instructions shown in the deposit form. Leave an address empty to hide that option. Copy the TRC20 address from Binance → Deposit → USDT → TRC20 and check it character by character whenever you change it, and consider your obligations around accepting crypto (identity checks, sanctions screening and record keeping) before you publish one.
- **Owed to owners** at the top is the total of every store balance, which is the money the platform holds on their behalf.

Confirming a deposit never accepts an order. The owner accepts each order themselves, once they have the funds.

## A store and its owner

Clicking a store in **Stores** opens everything about it in one place: the owner's name, email, phone, account status, when they joined and last signed in; the store's address, opening date, invitation code, pricing rule and currency; the wallet balance with what is available and what is held until delivery; the **wallet ledger** with a running balance; their deposits with the proof and what was credited; their withdrawals; recent orders; their **support conversations**, both their customers' and their own to Zendropship; and an **activity history** of what the owner and staff have done, with times and IP addresses.

**Add money** (in the store's *Money* panel) puts money into the owner's balance yourself — a transfer that arrived without the owner recording it, or money they are owed. Enter the amount that actually arrived, a reference if there is one, and what it is for; the dialog shows the balance before and after. It runs the same two steps as any deposit, recorded and then approved, so the owner sees it in their deposit history, the ledger gains exactly one entry, and both steps are in the audit log under your name. It accepts none of their orders. Nothing here writes a balance directly.

**There is no password to look up.** Passwords are only ever stored as a hash, so nobody — staff included — can read or show one. To get an owner back into their account, use **Send password reset**: their sessions end immediately, they cannot sign in until they follow the emailed link, and they choose the new password themselves. **Disable account** blocks sign-in altogether while keeping the store and its history. Both are written to the audit log.

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
- Confirmed → Accepted → Processing, in one step, when the **store owner** presses Accept (staff do it only for orders in Zendropship's own store). Orders left as *Awaiting funds* from before this rule wait for the owner the same way.
- Accepted → Processing, Packed or Shipped (for orders accepted before accepting went straight into processing)
- Processing → Packed or Shipped
- Packed → Shipped
- Shipped → Out for delivery or Delivered
- Out for delivery → Delivered

- **Payment first.** An online order confirms itself when the payment provider's verified confirmation arrives; cash on delivery confirms at once. An order still **Awaiting payment** — a card that never went through, say, when the customer then paid by bank transfer — has a **Confirm payment** button in the queue and on its page: it records the payment, confirms the order and posts the sale to the owner's ledger, held until delivery. The order then waits for the owner to accept it. Pressing it twice changes nothing. On an order that is already confirmed the same action is called **Mark as paid**.
**Working the queue.** **Orders → To fulfil** lists everything still to be dealt with, and every row shows what it is waiting for (`Next: Packed`) and a button for that step — accept, processing, packed, shipped, out for delivery, delivered — so an order can be moved on without opening it. Steps that tell the customer (shipped, delivered) ask for confirmation first. The order page has the same button, a **Skip ahead** dialog for the jumps the rules allow (accepted straight to shipped, say), and a **Fulfilment** panel showing every stage with its time and whoever moved it. Once an order is delivered the workflow is finished: no step is offered and the page says so.

- **Accepting** is the store owner's decision, and never automatic — not on payment, not on a deposit, not by any job. A confirmed order in an owner's store shows *Waiting for the store owner to accept* in the queue and has no button for staff; the server refuses staff acceptance of it too. The owner accepts it from their **Orders** page: the wholesale cost is set aside exactly once, however often Accept is pressed, and the order goes straight into **Processing**, ready to pack. When the customer has already paid, the cost comes out of that payment, so a normally priced paid order needs no deposit. A cash-on-delivery order has collected nothing yet, so its cost comes out of the owner's **available** balance. The order's timeline says who accepted it and where the money came from (*Accepted by the store owner — $300.00 wholesale cost set aside from the store balance*, say). If the owner's available balance cannot cover it, Accept is refused with *Insufficient wallet balance to accept this order. Please add funds.*, nothing is written, and the order keeps waiting until they have added funds and accept it. The owner's earnings stay held until you mark it **Delivered**, which releases them in the same step. Orders in Zendropship's own store have no owner: staff accept those (**Accept for fulfilment**), and nothing is charged.
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
- **Support inbox** holds every conversation: messages to Zendropship (including owners' own questions), messages in owners' stores, and anything written from the **Customer Service** button that floats in the corner of the platform site, every storefront and the owner dashboard — all of it the same kind of conversation, answered the same way. Filter by where it came from (*To Zendropship*, *In owners' stores*, *Assigned to me*) and by status, and search by subject, customer, order number or store. A dot marks unread conversations; opening one marks it read. The inbox keeps itself current: while it is open it checks every few seconds and shows a new message or reply as it arrives, without a reload — and so do the owner's and the customer's screens on the other side. A tab in the background stops checking and catches up the moment it is looked at again.
- Open a conversation to see the customer, whether they have an account, the store and the order it is about (linked only if the order really is theirs). **Assign** it to a colleague, **reply** — the customer gets it by email and, if signed in, in their account — or tick **Internal note** to leave a note only staff can see. A customer writing back reopens the conversation.
- When an owner asks about a deposit or a withdrawal, the payment is shown above the thread — amount, method, status and reference — so it can be checked without leaving the inbox. Replies land in the owner's dashboard under **Customer service → Your questions to Zendropship**, marked as new, and go out by email; internal notes are never shown to them.

## Content

- **Homepage sections.** Add, edit, reorder or hide: hero, trust bar, department grid, product rails (new, trending, best sellers, featured, on sale, optionally limited to a category), promo banners, editorial split, brand strip, reviews and newsletter.
- **Banners.** Hero, promo or editorial placements, with optional mobile image and schedule. In titles, wrap words in `_underscores_` for the italic accent.
- **Menus.** The footer columns use the menus `footer-help`, `footer-company` and `footer-legal`. The header navigation is built from active categories; the bar shows 9 departments and any extras appear under **More**.
- **Pages.** Markdown with headings, lists, tables and links; raw HTML is not rendered. Drafts are not public.
- **FAQ.** Questions are grouped, and drag rows to reorder.
- **Media library.** Uploads (JPEG, PNG, WebP, AVIF, GIF up to 10 MB) are converted to optimised WebP with metadata removed. Add alt text for accessibility and search.

## Settings

- **Store settings** — store name and legal details, support contact (the **support phone** here is the number the floating Customer Service panel offers to call, and the panel hides the call option until one is set), currency and locale, **commission and invitations**, announcement bar, commerce options (guest checkout, return window, reviews, low-stock threshold), SEO defaults, owner deposit details and social links.
- **Shipping & tax** — a destination uses the first zone listing its country, and `*` is the rest-of-world fallback. Each method has a price, optional free-shipping threshold and delivery estimate. Prices are shown before tax; a region-specific tax rate overrides the country rate.
- **Staff & roles** — add staff (an existing account with that email is promoted instead) and assign roles. You can only manage people and roles ranked below you, and only grant permissions you hold yourself. Changing someone's role signs them out; removing access turns the account back into a customer account.
- **Audit log** — every administrative and security-relevant action, with actor, time and IP address.

## Good practice

- Give every person their own account and the lowest role that fits their work.
- Remove access promptly when someone leaves.
- Test changes to shipping, tax and coupons with a test order before a sale.
- Review the audit log and low-stock notifications regularly.
