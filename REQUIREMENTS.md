# Zendropship — Discovery & Requirements

Internal document. Produced from a hands-on audit of `https://atzstore.store/` on 2026-09-13
before any implementation work. Every "source" claim below was observed directly (raw HTML,
the public WooCommerce Store API, the WordPress sitemap and rendered page inspection).
Where something could not be inspected, that limitation is stated.

---

## 0. Critical finding — what the source site actually is

The source is **not a conventional retail store**. It is a WordPress/WooCommerce install whose
customer-facing mechanics match the well-documented *"fake online-shop / distribution
seller"* deposit fraud pattern:

| Observation | Evidence |
|---|---|
| Registration is for **"stores"**, not shoppers | `/register-page/` fields: Store Name, Real Name, Store Address, Phone, Email, Password, Store Logo, **ID Card/Passport/Driving licence/Social Security Card (Front + Back)**, **Invitation Code**, captcha |
| Add-to-cart is labelled **"Distribution"** | Every product (`add_to_cart.text = "Distribution"` in the Store API) |
| Account area is a **wallet** | `/my/`: Personal Information, Language, Apply for Refund, **Financial Records**, **Financial Reports**, **Entrepreneur Alliance**; mobile "Wallet Dashboard" with balance, income, pending, **Deposit / Withdraw** buttons |
| **Withdrawals are blocked** | Site-wide modal: *"Please contact customer service for withdraw."* |
| Money-movement pages | Sitemap exposes `/deposit/`, `/withdraw/`, `/crypto-payment/` (`[crypto_payment]` shortcode), `/transfer-in/`, `/transfer-out/`, `/financial-management/` (CSS section "Investment Transfer Pages") |
| Seller order pipeline | `/order/` tabs: All orders, **Awaiting Pickup**, Waiting for Shipment, Shipped, **Waiting for Payment**, Received, Completed, Cancelled; `/distribution-center/`, `/admin-pickup-page/` |
| No real checkout | `/cart/` → 404; `/checkout/` shows a distribution portal, no address/shipping/payment fields |
| No policies | Footer "Terms & conditions / Return policy / Support Policy / Privacy policy" are **unlinked text**; conventional policy URLs 404 |
| Support = external chat only | Tawk.to widget + `/service/` page with no contact details |
| Catalogue is borrowed | 146 products naming Valentino, Ralph Lauren, Strathberry, Shinola, Apple, Seiko, etc.; 0 SKUs, 0 descriptions, 1 image each, 0 reviews, 0 variants, all "in stock" |

### Decisions that follow

1. **Zendropship is a legitimate B2C retailer.** We replicate the *legitimate* surface of the source
   (multi-category catalogue, category browsing, sort, product pages, reviews, account, orders)
   and build the retail flows the source lacks (cart, checkout, payments, fulfilment, policies).
2. **Not reproduced, by design:** seller/"store" registration, government-ID upload, invitation
   codes, wallets/balances, deposits, crypto top-ups, transfer-in/out, "distribution"/pickup
   order mechanics, blocked withdrawals, "Entrepreneur Alliance". These are fraud mechanics,
   not e-commerce features.
3. **The source catalogue is not imported by default.** The importer is fully built and can pull
   from any WooCommerce Store API or CSV the operator is authorised to use, but the source's
   products are third-party trademarks and images whose rights the source operator could not
   grant. Zendropship ships an original launch catalogue (own copy, own house brands, photography
   under the Unsplash License — see `CREDITS.md`).

---

## 1. Existing functionality (legitimate surface only)

| Area | Source behaviour |
|---|---|
| Platform | WordPress 6 + WooCommerce, Hello Elementor child theme, Elementor Pro, Essential Addons, Hostinger CDN, PHP 8.3 |
| Currency | USD only, `$` prefix, 2 decimals; no currency or language switcher on the storefront |
| Header | Logo; top links Service, Register, Login, My Account; category nav |
| Navigation | Flat, no mega-menu: Woman's, Man's, Watches, Mobile, Kids, Electronics, Cosmetics |
| Categories (Store API) | 11 flat categories, no subcategories: Cosmetics (28), Dental Surgical Instruments (9), Electric scooty (5), Electronics (13), Kids (42), ladies Bags (7), Man's (10), Mobile (3), Uncategorized (1), Watches (17), Woman's (12). Products can sit in several categories |
| Homepage | New Products (4), Featured Products (4), Best Selling (4), then one 4-product rail per category (Women, Men, Watches, Mobile, Kids, Cosmetics, Electronics), Top Brands logo strip (Adidas, Apple, ASUS, Volvo, Samsung, Pampers — logos only, unlinked) |
| Listing page | Breadcrumb, title, "Showing 1–16 of 17 results", WooCommerce sort (default, popularity, rating, latest, price asc, price desc), 4-col grid, "Sale!" badge, numbered pagination (16/page). **No filters** |
| Search | WordPress `?s=…&post_type=product`, results page only, no suggestions |
| Product page | Breadcrumb, single image (no zoom/gallery), title, price (regular + sale strike-through when on sale), quantity input, primary button, categories meta, Reviews tab, 4 related products. No description, SKU, stock, specs or shipping info |
| Reviews | Standard WooCommerce form: rating (Perfect / Good / Average / Not that bad / Very poor), review, name, email, "save my details" |
| Brands | Only a logo strip. Store API `/products/brands` is empty; no brand pages |
| Tags | 2 tags (Electric bike, Iphone 16 pro max) |
| Auth | Login with "Email / Username / Phone" + password + image captcha; "Forgot password?"; `/password-reset/` |
| Account | Login wall → wallet dashboard (see §0) |
| Footer | Unlinked policy labels, 12 payment logos (Visa, Mastercard, PayPal, Apple Pay, Google Pay, Amazon Pay, Stripe, Alipay, WeChat Pay, Klarna…) with **no matching gateways**, © 2026 |
| Floating widgets | Tawk.to live chat |
| Mobile | Elementor breakpoints 480/600/768px; app-style bottom nav (Home, Product, Financial Management, Order, My) |
| SEO | WordPress core sitemap, minimal meta, no product structured data observed, no OpenGraph on home |

**Limitations of the audit:** all pages behind login (order detail, "Financial Records",
"Entrepreneur Alliance", admin pages) render "Please login" / "Access denied" for anonymous
visitors and were not inspected further. No account was created: registration requires
submitting government ID, which we will not do. Nothing here is inferred about those screens
beyond their titles and publicly shipped CSS/JS.

## 2. Page structure → Zendropship route map

| Source | Zendropship |
|---|---|
| `/` | `/` CMS-driven homepage |
| `/shop/` | `/shop` all products with filters |
| `/product-category/{slug}/` | `/c/{slug}` and `/c/{parent}/{child}` |
| — (logo strip only) | `/brands`, `/brands/{slug}` |
| — | `/collections/{slug}` (New arrivals, Best sellers, Sale…) |
| `/product/{slug}/` | `/p/{slug}` |
| `/?s=` | `/search?q=` + instant suggestions |
| `/cart/` (404) | `/cart` + slide-over mini-cart |
| `/checkout/` (portal) | `/checkout` → `/checkout/confirmation/{orderNumber}` |
| `/login-page/`, `/register-page/`, `/password-reset/` | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` |
| `/my/` | `/account` (overview, orders, order detail + tracking, addresses, wishlist, recently viewed, reviews, notifications, profile, security) |
| — | `/wishlist`, `/track-order` (guest lookup) |
| Unlinked footer labels | `/pages/{slug}`: about, contact, terms, privacy, returns, shipping, support policy; `/faq`; `/contact` |
| `/service/` + Tawk | `/contact` form stored in DB + admin inbox (third-party chat can be added via settings) |
| `wp-admin` | `/admin/**` separate dashboard |

## 3. Data / entities

Source (WooCommerce Store API shape): product {id, name, slug, sku, short_description,
description, prices{regular, sale, currency}, on_sale, images[], categories[], tags[], brands[],
attributes[], variations[], weight, dimensions, stock, average_rating, review_count}; category
{id, name, slug, parent, count, image}; review {rating 1–5, text, name, email}.

Zendropship (full schema in `DATABASE.md`): User, Role, Permission, RolePermission, Session,
VerificationToken, Address, Category (self-referencing tree), Brand, Collection, Tag,
Product, ProductImage, MediaAsset, ProductVariant, Attribute, AttributeValue,
VariantOptionValue, ProductAttributeValue, InventoryMovement, Cart, CartItem, Wishlist,
WishlistItem, Order, OrderItem, OrderEvent, Payment, PaymentTransaction, Refund, Shipment,
ShippingZone, ShippingMethod, TaxRate, Coupon, CouponRedemption, Review, ReviewImage,
Notification, NotificationDelivery, SearchQuery, AuditLog, Setting, Page, Banner,
HomeSection, Menu, MenuItem, ContactMessage, NewsletterSubscriber, ImportRun,
ImportRecord, RecentlyViewed, WebhookEvent, IdempotencyKey, RateLimitBucket.

## 4. Customer flows

1. **Discover:** home → category/brand/collection → filter/sort → product.
2. **Search:** header search → instant suggestions (products, categories, brands, recent,
   popular) → results page with the same filters.
3. **Evaluate:** gallery + zoom, variant selection (price/stock/SKU/image update), specs,
   shipping & returns, reviews, related, frequently bought together, recently viewed.
4. **Cart:** add (mini-cart opens) → change qty / remove → coupon → shipping estimate → totals.
   Guest cart by signed cookie; persisted per user; merged at login.
5. **Checkout:** contact → shipping address (saved addresses for customers) → delivery method
   → payment method → review → place order (idempotency key) → hosted/embedded payment →
   webhook confirms → confirmation page + email.
6. **After purchase:** account order list → order detail → tracking timeline
   (Placed → Payment confirmed → Processing → Packed → Shipped → Out for delivery →
   Delivered) → review purchased products (verified badge). Guests use `/track-order`.
7. **Account:** register → verify email → login → forgot/reset password → profile, addresses,
   wishlist, notifications, security (change password, sign out other sessions).

## 5. Admin requirements

Dashboard KPIs & charts; products (CRUD, archive, duplicate, variants, attributes, media,
SEO, publish, bulk actions, CSV import/export, bulk price & inventory); inventory ledger;
orders (search/filter, status workflow, shipments & tracking, internal notes, refunds via
provider, cancel with restock, invoice print/PDF, resend confirmation, activity timeline);
customers (search, spend, orders, addresses, disable, force password reset, activity);
catalogue taxonomy (categories tree, brands, collections, tags, attributes, drag-and-drop
ordering); coupons; reviews moderation; CMS (banners, home sections, pages, FAQ, menus,
footer, announcement bar, store settings); media library; shipping zones/methods & tax
rates; roles & permissions; audit log; import runs; contact inbox. All enforced server-side
through RBAC (SUPER_ADMIN, ADMIN, MANAGER, CUSTOMER).

## 6. Missing / improvable functionality in the source

- No cart, checkout, payment gateways, shipping, or tax (payment logos are decorative).
- No policies despite footer labels; no contact details.
- No filters, no instant search, no brand pages, no subcategories, flat 16-per-page pagination.
- Product data is thin: no descriptions, SKUs, stock, variants, galleries, specs.
- No wishlist, no order tracking for shoppers, no guest checkout.
- Image captcha on login (poor accessibility) instead of rate limiting.
- Inconsistent naming/spelling ("Cosmatics", "ladies Begs", "Woman's"), an "Uncategorized"
  bucket and unrelated verticals (dental instruments) mixed into a fashion store.
- No structured data, OpenGraph or canonical strategy; WordPress sitemap includes internal
  pages (`/admin-order-page/`, `/withdraw/`).
- No accessible dialogs; "Withdrawal" modal is injected on every page.

## 7. Zendropship improvements

- Real commerce core: persistent carts, one-page accordion checkout, provider-agnostic
  payments with webhook-verified status, shipments, refunds, taxes, coupons.
- Curated taxonomy: Women, Men, Kids, Beauty, Watches & Jewellery, Bags, Tech, Home — with
  subcategories; brand and collection landing pages.
- Faceted filtering (price, brand, rating, availability, sale, attributes) with a mobile
  bottom sheet; grid/list toggle; URL-encoded state for shareable, crawlable listings.
- Postgres full-text + trigram search with typo tolerance, suggestions, history and popular
  searches, behind a `SearchProvider` interface (Meilisearch/Algolia later).
- Variant-aware product pages with zoomable gallery, sticky buy bar, bundles, recently viewed.
- Accessible, rate-limited auth (no image captcha), email verification, session management.
- Full admin with RBAC, audit trail, CMS-driven home and navigation, media library, importer.
- SEO from day one: canonical URLs, JSON-LD (Product, BreadcrumbList, Organization,
  WebSite/SearchAction), OG/Twitter cards, sitemap excluding private routes.
- Transparent trust surface: real policies, contact form, visible support channels.
