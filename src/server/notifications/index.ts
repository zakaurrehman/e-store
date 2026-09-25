import type { Prisma } from "@/generated/prisma/client";
import { DeliveryStatus, NotificationAudience, NotificationChannel } from "@/generated/prisma/enums";
import type { EmailBrand, RenderedEmail } from "@/emails/layout";
import * as templates from "@/emails/templates";
import type { OrderEmailData } from "@/emails/templates";
import { isAddressSnapshot } from "@/lib/address";
import { storeUrl } from "@/lib/tenancy";
import type { Permission } from "@/lib/permissions";
import { loadSettings } from "@/features/settings/service";
import { fulfilmentShortfallCents } from "@/features/wallet/service";
import { db } from "@/server/db";
import { getEmailProvider } from "@/server/email/provider";
import { env } from "@/server/env";
import { hmacSha256 } from "@/server/security/crypto";
import { formatMoney } from "@/utils/money";
import { getPushProvider, getSmsProvider } from "./channels";
import { depositMethodLabel, payoutMethodLabel } from "@/lib/money-methods";

/**
 * Customer emails are sent in the name of the store the customer shops at and link back to that store's domain.
 * `storeId` on account events is the store the request came from (null = the platform site).
 */
export type NotificationEvent =
  | { type: "user.registered"; userId: string; verificationToken: string; storeId?: string | null }
  | { type: "user.verification-requested"; userId: string; verificationToken: string; storeId?: string | null }
  | { type: "user.password-reset-requested"; userId: string; token: string; storeId?: string | null }
  | { type: "order.confirmed"; orderId: string }
  | { type: "order.payment-received"; orderId: string }
  | { type: "order.payment-failed"; orderId: string; reason?: string }
  | { type: "order.shipped"; orderId: string; shipmentId: string }
  | { type: "order.delivered"; orderId: string }
  | { type: "order.refunded"; orderId: string; amountCents: number }
  | { type: "order.cancelled"; orderId: string; reason?: string; refunded: boolean }
  | { type: "inventory.low-stock"; variantIds: string[] }
  | { type: "review.submitted"; reviewId: string }
  | { type: "store-review.submitted"; reviewId: string }
  | { type: "contact.received"; messageId: string }
  | { type: "contact.replied"; messageId: string; replyId: string }
  | { type: "support.customer-replied"; messageId: string; replyId: string }
  | { type: "order.accepted"; orderId: string }
  | { type: "wallet.deposit-submitted"; depositId: string }
  | { type: "wallet.deposit-settled"; depositId: string; confirmed: boolean }
  | { type: "wallet.payout-requested"; payoutId: string }
  | { type: "wallet.payout-settled"; payoutId: string; paid: boolean }
  | { type: "store.opened"; storeId: string };

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

/** Signed token allowing a guest to open their order page from an email link. */
export function orderAccessToken(order: { number: string; email: string }) {
  return hmacSha256(`order-access:${order.number}:${order.email.toLowerCase()}`);
}

type StoreForEmail = { slug: string; name: string; supportEmail: string | null; ownerId: string | null; logo?: { url: string } | null };

/** Everything an email needs to go out in a store's name — including that store's own logo. */
export const storeForEmailSelect = { slug: true, name: true, supportEmail: true, ownerId: true, logo: { select: { url: true } } } as const;

async function loadStore(storeId: string | null | undefined): Promise<StoreForEmail | null> {
  if (!storeId) return null;
  return db.store.findUnique({ where: { id: storeId }, select: storeForEmailSelect });
}

/** Where a customer's links point: their store's domain, or the platform site. */
function originFor(store: StoreForEmail | null) {
  return store ? storeUrl(store.slug) : env.APP_URL;
}

export function orderUrl(order: { number: string; email: string; userId: string | null }, origin: string = env.APP_URL) {
  if (order.userId) return new URL(`/account/orders/${order.number}`, origin).toString();
  return new URL(`/orders/${order.number}?token=${orderAccessToken(order)}`, origin).toString();
}

/** Owner stores send under their own name and support address; the platform store and platform emails use the company settings. */
async function getBrand(store: StoreForEmail | null = null): Promise<EmailBrand> {
  const settings = await loadSettings();
  if (store?.ownerId) {
    const origin = originFor(store);
    return {
      storeName: store.name,
      legalName: store.name,
      supportEmail: store.supportEmail ?? settings.store.supportEmail,
      address: "",
      appUrl: origin,
      // The logo belongs to this store and no other: it comes from the same row the name does.
      logoUrl: store.logo?.url ? new URL(store.logo.url, origin).toString() : null,
    };
  }
  return {
    storeName: settings.store.name,
    legalName: settings.store.legalName,
    supportEmail: settings.store.supportEmail,
    address: settings.store.address,
    appUrl: originFor(store),
  };
}

async function loadOrderEmailData(orderId: string) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, user: { select: { firstName: true } }, store: { select: storeForEmailSelect } },
  });
  const shipping = isAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null;
  if (!shipping) throw new Error(`Order ${order.number} has an invalid shipping address snapshot`);
  const paymentLabels: Record<string, string> = {
    stripe: "Card (Stripe)",
    paypal: "PayPal",
    cod: "Cash on delivery",
    sandbox: "Test card (sandbox)",
  };
  const data: OrderEmailData = {
    number: order.number,
    placedAt: order.placedAt,
    currency: order.currency,
    customerFirstName: order.user?.firstName ?? shipping.firstName,
    items: order.items.map((item) => ({
      name: item.productName,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      totalCents: item.totalCents,
    })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    couponCode: order.couponCode,
    shippingAddress: shipping,
    shippingMethodName: order.shippingMethodName,
    paymentLabel: paymentLabels[order.paymentProvider] ?? order.paymentProvider,
  };
  const brand = await getBrand(order.store);
  return { order, data, url: orderUrl(order, originFor(order.store)), brand };
}

/** The owner of a store, when there is one and the account is still active. */
async function storeOwner(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, slug: true, ownerId: true } });
  if (!store?.ownerId) return null;
  const owner = await db.user.findFirst({ where: { id: store.ownerId, deletedAt: null }, select: { id: true, email: true, firstName: true } });
  return owner ? { store, owner } : null;
}

async function staffRecipients(permission: Permission) {
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      role: { isStaff: true, permissions: { some: { permission: { key: permission } } } },
    },
    select: { id: true, email: true },
  });
  return users;
}

type Planned = {
  inApp?: { audience: NotificationAudience; userId: string | null; type: string; title: string; body: string; href?: string; data?: Prisma.InputJsonValue };
  emails?: Array<{ to: string; template: string; rendered: RenderedEmail; replyTo?: string }>;
};

async function plan(event: NotificationEvent): Promise<Planned[]> {
  const platformBrand = await getBrand();
  const app = (path: string) => new URL(path, env.APP_URL).toString();

  switch (event.type) {
    case "user.registered":
    case "user.verification-requested": {
      const user = await db.user.findUniqueOrThrow({ where: { id: event.userId } });
      const store = await loadStore(event.storeId !== undefined ? event.storeId : user.registeredStoreId);
      const brand = await getBrand(store);
      const verifyUrl = new URL(`/verify-email?token=${encodeURIComponent(event.verificationToken)}`, originFor(store)).toString();
      const rendered =
        event.type === "user.registered"
          ? templates.welcomeEmail(brand, { firstName: user.firstName, verifyUrl })
          : templates.verifyEmailEmail(brand, { firstName: user.firstName, verifyUrl });
      return [{ emails: [{ to: user.email, template: event.type, rendered }] }];
    }

    case "user.password-reset-requested": {
      const user = await db.user.findUniqueOrThrow({ where: { id: event.userId }, include: { role: { select: { isStaff: true, key: true } } } });
      // Staff and store owners reset on the platform site; customers on the store they shop at.
      const platformAccount = user.role.isStaff || user.role.key === "STORE_OWNER";
      const store = platformAccount ? null : await loadStore(event.storeId !== undefined ? event.storeId : user.registeredStoreId);
      const brand = await getBrand(store);
      const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(event.token)}`, originFor(store)).toString();
      return [{ emails: [{ to: user.email, template: event.type, rendered: templates.passwordResetEmail(brand, { firstName: user.firstName, resetUrl }) }] }];
    }

    case "order.confirmed": {
      const { order, data, url, brand } = await loadOrderEmailData(event.orderId);
      const staff = await staffRecipients("orders.view");
      const paid = order.paymentStatus === "PAID";
      const owner = order.store.ownerId ? await db.user.findUnique({ where: { id: order.store.ownerId }, select: { id: true, email: true, deletedAt: true } }) : null;
      return [
        {
          inApp: order.userId
            ? { audience: NotificationAudience.CUSTOMER, userId: order.userId, type: event.type, title: `Order ${order.number} confirmed`, body: "We're preparing your order.", href: `/account/orders/${order.number}` }
            : undefined,
          emails: [{ to: order.email, template: event.type, rendered: templates.orderConfirmationEmail(brand, { order: data, orderUrl: url, paid }) }],
        },
        {
          inApp: {
            audience: NotificationAudience.STAFF,
            userId: null,
            type: "order.new",
            title: `New order ${order.number}`,
            body: `${data.items.reduce((sum, item) => sum + item.quantity, 0)} items · ${formatMoney(order.totalCents, order.currency)}`,
            href: `/admin/orders/${order.id}`,
          },
          emails: staff.map((member) => ({
            to: member.email,
            template: "staff.order-new",
            rendered: templates.staffAlertEmail(platformBrand, {
              title: `New order ${order.number}${order.store.ownerId ? ` · ${order.store.name}` : ""}`,
              lines: [`${order.email} placed an order.`, `Payment: ${data.paymentLabel} (${order.paymentStatus.toLowerCase()})`],
              href: app(`/admin/orders/${order.id}`),
              cta: "Open order",
            }),
          })),
        },
        // The store owner hears about every sale, and that it waits for them: nothing is fulfilled until they accept it.
        ...(owner && !owner.deletedAt
          ? await (async () => {
              const shortCents = await fulfilmentShortfallCents(order.id);
              return [
                {
                  inApp: {
                    audience: NotificationAudience.CUSTOMER,
                    userId: owner.id,
                    type: "store.order-new",
                    title: `New order ${order.number} — accept it to start fulfilment`,
                    body: shortCents > 0 ? `Add ${formatMoney(shortCents, order.currency)} to your balance, then accept it` : `${formatMoney(order.totalCents, order.currency)} · waiting for you to accept`,
                    href: `/dashboard/orders/${order.number}`,
                  },
                  emails: [
                    {
                      to: owner.email,
                      template: "owner.order-new",
                      rendered: templates.staffAlertEmail(platformBrand, {
                        title: `New order in ${order.store.name}`,
                        lines: [
                          `Order ${order.number} · ${formatMoney(order.totalCents, order.currency)}`,
                          "It is waiting for you: open it and press Accept, and Zendropship starts fulfilling it.",
                          ...(shortCents > 0 ? [`Your available balance is ${formatMoney(shortCents, order.currency)} short of what this order needs. Add funds first, then accept it.`] : []),
                        ],
                        href: app(`/dashboard/orders/${order.number}`),
                        cta: "Open the order",
                      }),
                    },
                  ],
                },
              ];
            })()
          : []),
      ];
    }

    case "order.payment-received": {
      const { order, data, url, brand } = await loadOrderEmailData(event.orderId);
      return [
        {
          inApp: order.userId
            ? { audience: NotificationAudience.CUSTOMER, userId: order.userId, type: event.type, title: `Payment received for ${order.number}`, body: "Thank you — your payment is confirmed.", href: `/account/orders/${order.number}` }
            : undefined,
          emails: [{ to: order.email, template: event.type, rendered: templates.paymentConfirmationEmail(brand, { order: data, orderUrl: url }) }],
        },
      ];
    }

    case "order.payment-failed": {
      const { order, data, url, brand } = await loadOrderEmailData(event.orderId);
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `Payment failed for ${order.number}`, body: event.reason ?? "The payment provider declined the payment.", href: `/admin/orders/${order.id}` },
          emails: [{ to: order.email, template: event.type, rendered: templates.paymentFailedEmail(brand, { order: data, retryUrl: url, reason: event.reason }) }],
        },
      ];
    }

    case "order.shipped": {
      const { order, data, url, brand } = await loadOrderEmailData(event.orderId);
      const shipment = await db.shipment.findUniqueOrThrow({ where: { id: event.shipmentId } });
      return [
        {
          inApp: order.userId
            ? { audience: NotificationAudience.CUSTOMER, userId: order.userId, type: event.type, title: `Order ${order.number} has shipped`, body: shipment.trackingNumber ? `Tracking: ${shipment.trackingNumber}` : "Your parcel is on its way.", href: `/account/orders/${order.number}` }
            : undefined,
          emails: [
            {
              to: order.email,
              template: event.type,
              rendered: templates.shippingConfirmationEmail(brand, { order: data, orderUrl: url, carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl }),
            },
          ],
        },
      ];
    }

    case "order.delivered": {
      const { order, data, url, brand } = await loadOrderEmailData(event.orderId);
      const firstProduct = order.items[0]?.productSlug;
      const reviewUrl = order.userId ? app(`/account/reviews`) : firstProduct ? app(`/p/${firstProduct}#reviews`) : url;
      return [
        {
          inApp: order.userId
            ? { audience: NotificationAudience.CUSTOMER, userId: order.userId, type: event.type, title: `Order ${order.number} delivered`, body: "Enjoy! Tell us what you think with a review.", href: `/account/orders/${order.number}` }
            : undefined,
          emails: [{ to: order.email, template: event.type, rendered: templates.deliveryConfirmationEmail(brand, { order: data, orderUrl: url, reviewUrl }) }],
        },
      ];
    }

    case "order.refunded": {
      const { order, data, url, brand } = await loadOrderEmailData(event.orderId);
      return [
        {
          inApp: order.userId
            ? { audience: NotificationAudience.CUSTOMER, userId: order.userId, type: event.type, title: `Refund issued for ${order.number}`, body: "Your refund is on its way to your original payment method.", href: `/account/orders/${order.number}` }
            : undefined,
          emails: [{ to: order.email, template: event.type, rendered: templates.refundEmail(brand, { order: data, amountCents: event.amountCents, orderUrl: url }) }],
        },
      ];
    }

    case "order.cancelled": {
      const { order, data, url, brand } = await loadOrderEmailData(event.orderId);
      return [
        {
          inApp: order.userId
            ? { audience: NotificationAudience.CUSTOMER, userId: order.userId, type: event.type, title: `Order ${order.number} cancelled`, body: event.reason ?? "Your order was cancelled.", href: `/account/orders/${order.number}` }
            : undefined,
          emails: [{ to: order.email, template: event.type, rendered: templates.cancellationEmail(brand, { order: data, reason: event.reason, orderUrl: url, refunded: event.refunded }) }],
        },
      ];
    }

    case "inventory.low-stock": {
      const variants = await db.productVariant.findMany({
        where: { id: { in: event.variantIds } },
        include: { product: { select: { id: true, name: true } } },
      });
      if (variants.length === 0) return [];
      const staff = await staffRecipients("inventory.update");
      const lines = variants.map((variant) => `${variant.product.name}${variant.title !== "Default" ? ` — ${variant.title}` : ""}: ${variant.stockQuantity} left`);
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `Low stock: ${variants.length} item${variants.length === 1 ? "" : "s"}`, body: lines.slice(0, 3).join(" · "), href: "/admin/inventory?filter=low" },
          emails: staff.map((member) => ({
            to: member.email,
            template: "staff.low-stock",
            rendered: templates.staffAlertEmail(platformBrand, { title: "Low stock alert", lines, href: app("/admin/inventory?filter=low"), cta: "Review inventory" }),
          })),
        },
      ];
    }

    case "review.submitted": {
      const review = await db.review.findUniqueOrThrow({ where: { id: event.reviewId }, include: { product: { select: { name: true } } } });
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `New ${review.rating}★ review`, body: `${review.product.name}: “${review.title}”`, href: `/admin/reviews?status=${review.status}` },
        },
      ];
    }

    case "store-review.submitted": {
      // The owner hears about every review of their store; staff too while it waits for their approval.
      const review = await db.storeReview.findUniqueOrThrow({ where: { id: event.reviewId }, include: { store: { select: { name: true, ownerId: true } } } });
      const stars = "★".repeat(review.rating);
      const excerpt = review.body.length > 80 ? `${review.body.slice(0, 77)}…` : review.body;
      const deliveries: Planned[] = [];
      if (review.store.ownerId) {
        deliveries.push({ inApp: { audience: NotificationAudience.CUSTOMER, userId: review.store.ownerId, type: event.type, title: `New ${stars} review from ${review.authorName}`, body: excerpt, href: "/dashboard/reviews" } });
      }
      if (review.status === "PENDING") {
        deliveries.push({ inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `New ${review.rating}★ review of ${review.store.name}`, body: excerpt, href: "/admin/store-reviews?status=PENDING" } });
      }
      return deliveries;
    }

    case "contact.received": {
      const message = await db.contactMessage.findUniqueOrThrow({ where: { id: event.messageId }, include: { store: { select: storeForEmailSelect } } });
      const owner = message.store?.ownerId ? await db.user.findUnique({ where: { id: message.store.ownerId }, select: { id: true, email: true, deletedAt: true } }) : null;
      // A message written in an owner's store is that owner's to answer; everything else reaches Zendropship staff.
      if (owner && !owner.deletedAt) {
        return [
          {
            inApp: { audience: NotificationAudience.CUSTOMER, userId: owner.id, type: event.type, title: `Message from ${message.name}`, body: message.subject, href: `/dashboard/support?id=${message.id}` },
            emails: [
              {
                to: owner.email,
                template: "owner.contact-received",
                rendered: templates.staffAlertEmail(platformBrand, {
                  title: `New customer message in ${message.store?.name ?? "your store"}`,
                  lines: [`${message.name} (${message.email}) wrote: ${message.subject}`, message.message.slice(0, 300)],
                  href: app(`/dashboard/support?id=${message.id}`),
                  cta: "Read and reply",
                }),
                replyTo: message.email,
              },
            ],
          },
        ];
      }
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `Message from ${message.name}`, body: message.subject, href: `/admin/messages/${message.id}` },
        },
      ];
    }

    case "support.customer-replied": {
      const message = await db.contactMessage.findUniqueOrThrow({ where: { id: event.messageId }, include: { store: { select: storeForEmailSelect } } });
      const reply = await db.contactReply.findUniqueOrThrow({ where: { id: event.replyId } });
      const lines = [`${message.name} (${message.email}) wrote back about "${message.subject}"`, reply.body.slice(0, 300)];
      // A reply in a store's conversation is the owner's to answer; on the platform site it is Zendropship's.
      if (message.storeId) {
        const target = await storeOwner(message.storeId);
        if (!target) return [];
        return [
          {
            inApp: { audience: NotificationAudience.CUSTOMER, userId: target.owner.id, type: "support.customer-replied", title: `New reply from ${message.name}`, body: message.subject, href: `/dashboard/support?id=${message.id}` },
            emails: [
              {
                to: target.owner.email,
                template: "owner.support-reply",
                rendered: templates.staffAlertEmail(platformBrand, { title: `New reply in ${target.store.name}`, lines, href: app(`/dashboard/support?id=${message.id}`), cta: "Read and reply" }),
                replyTo: message.email,
              },
            ],
          },
        ];
      }
      const staff = await staffRecipients("messages.view");
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: "support.customer-replied", title: `New reply from ${message.name}`, body: message.subject, href: `/admin/messages?id=${message.id}` },
          emails: staff.map((member) => ({
            to: member.email,
            template: "staff.support-reply",
            rendered: templates.staffAlertEmail(platformBrand, { title: "New reply in a support conversation", lines, href: app(`/admin/messages?id=${message.id}`), cta: "Open conversation" }),
          })),
        },
      ];
    }

    case "order.accepted": {
      // The owner accepted it themselves; fulfilment is who needs to know there is something to pack.
      const order = await db.order.findUniqueOrThrow({ where: { id: event.orderId }, select: { id: true, number: true, store: { select: { name: true, ownerId: true } } } });
      return [
        {
          inApp: {
            audience: NotificationAudience.STAFF,
            userId: null,
            type: "order.accepted",
            title: `Order ${order.number} accepted — ready to fulfil`,
            body: order.store.ownerId ? `Accepted by ${order.store.name}` : "Accepted for Zendropship's own store",
            href: `/admin/orders/${order.id}`,
          },
        },
      ];
    }

    case "wallet.deposit-submitted": {
      const deposit = await db.deposit.findUniqueOrThrow({ where: { id: event.depositId }, include: { store: { select: { name: true } } } });
      const staff = await staffRecipients("stores.manage");
      const lines = [
        `${deposit.store.name} says they have sent ${formatMoney(deposit.amountCents)}`,
        `Method: ${depositMethodLabel(deposit)}${deposit.reference ? ` · reference ${deposit.reference}` : ""}`,
        deposit.proofMediaId ? "A screenshot is attached — check the transfer itself before confirming." : "No screenshot was attached.",
      ];
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `Deposit to confirm: ${formatMoney(deposit.amountCents)}`, body: deposit.store.name, href: "/admin/deposits" },
          emails: staff.map((member) => ({
            to: member.email,
            template: "staff.deposit-submitted",
            rendered: templates.staffAlertEmail(platformBrand, { title: "A deposit is waiting to be confirmed", lines, href: app("/admin/deposits"), cta: "Check deposits" }),
          })),
        },
      ];
    }

    case "wallet.deposit-settled": {
      const deposit = await db.deposit.findUniqueOrThrow({ where: { id: event.depositId }, select: { id: true, amountCents: true, storeId: true, note: true } });
      const target = await storeOwner(deposit.storeId);
      if (!target) return [];
      const amount = formatMoney(deposit.amountCents);
      return [
        {
          inApp: {
            audience: NotificationAudience.CUSTOMER,
            userId: target.owner.id,
            type: event.type,
            title: event.confirmed ? `${amount} added to your balance` : `Deposit of ${amount} declined`,
            body: event.confirmed ? "The transfer has been confirmed." : (deposit.note ?? "We could not find the transfer."),
            href: "/dashboard/balance",
          },
          emails: [
            {
              to: target.owner.email,
              template: event.confirmed ? "owner.deposit-confirmed" : "owner.deposit-rejected",
              rendered: templates.staffAlertEmail(platformBrand, {
                title: event.confirmed ? `${amount} is in your balance` : `We could not confirm your ${amount} deposit`,
                lines: event.confirmed ? ["Your deposit has been confirmed and credited.", "Any order waiting for funds goes to fulfilment automatically."] : [deposit.note ?? "We could not find the transfer.", "Nothing has been credited. Contact support with the transaction details and we will look again."],
                href: app("/dashboard/balance"),
                cta: "Open your balance",
              }),
            },
          ],
        },
      ];
    }

    case "wallet.payout-requested": {
      const payout = await db.payout.findUniqueOrThrow({ where: { id: event.payoutId }, include: { store: { select: { name: true } } } });
      const staff = await staffRecipients("stores.manage");
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `Withdrawal to send: ${formatMoney(payout.amountCents)}`, body: payout.store.name, href: "/admin/payouts" },
          emails: staff.map((member) => ({
            to: member.email,
            template: "staff.payout-requested",
            rendered: templates.staffAlertEmail(platformBrand, {
              title: `${payout.store.name} asked to withdraw ${formatMoney(payout.amountCents)}`,
              lines: [`Send to: ${payoutMethodLabel(payout.method)} · ${payout.destination}`, "Mark it paid once the transfer has been sent."],
              href: app("/admin/payouts"),
              cta: "Open withdrawals",
            }),
          })),
        },
      ];
    }

    case "wallet.payout-settled": {
      const payout = await db.payout.findUniqueOrThrow({ where: { id: event.payoutId }, select: { amountCents: true, storeId: true, reference: true } });
      const target = await storeOwner(payout.storeId);
      if (!target) return [];
      const amount = formatMoney(payout.amountCents);
      return [
        {
          inApp: {
            audience: NotificationAudience.CUSTOMER,
            userId: target.owner.id,
            type: event.type,
            title: event.paid ? `${amount} sent to you` : `Withdrawal of ${amount} declined`,
            body: event.paid ? (payout.reference ?? "The transfer is on its way.") : (payout.reference ?? "The amount is back in your balance."),
            href: "/dashboard/balance",
          },
          emails: [
            {
              to: target.owner.email,
              template: event.paid ? "owner.payout-paid" : "owner.payout-rejected",
              rendered: templates.staffAlertEmail(platformBrand, {
                title: event.paid ? `We have sent you ${amount}` : `Your ${amount} withdrawal was declined`,
                lines: event.paid
                  ? [`Reference: ${payout.reference ?? "—"}`, "Bank transfers usually arrive within a few working days."]
                  : [payout.reference ?? "The details did not check out.", "The amount is back in your balance and you can request it again."],
                href: app("/dashboard/balance"),
                cta: "Open your balance",
              }),
            },
          ],
        },
      ];
    }

    case "store.opened": {
      const store = await db.store.findUniqueOrThrow({ where: { id: event.storeId }, include: { owner: { select: { email: true, firstName: true, lastName: true } }, referral: { include: { code: { select: { code: true } } } } } });
      const staff = await staffRecipients("stores.view");
      return [
        {
          inApp: { audience: NotificationAudience.STAFF, userId: null, type: event.type, title: `New store: ${store.name}`, body: `${store.slug} · ${store.owner?.email ?? "no owner"}`, href: `/admin/stores?q=${store.slug}` },
          emails: staff.map((member) => ({
            to: member.email,
            template: "staff.store-opened",
            rendered: templates.staffAlertEmail(platformBrand, {
              title: `${store.name} has opened`,
              lines: [
                `Address: ${storeUrl(store.slug)}`,
                `Owner: ${store.owner ? `${store.owner.firstName} ${store.owner.lastName} (${store.owner.email})` : "unknown"}`,
                store.referral[0]?.code ? `Invitation used: ${store.referral[0].code.code}` : "No invitation code recorded.",
              ],
              href: app(`/admin/stores?q=${store.slug}`),
              cta: "Open stores",
            }),
          })),
        },
      ];
    }

    case "contact.replied": {
      const [message, reply] = await Promise.all([
        db.contactMessage.findUniqueOrThrow({ where: { id: event.messageId }, include: { store: { select: storeForEmailSelect } } }),
        db.contactReply.findUniqueOrThrow({ where: { id: event.replyId } }),
      ]);
      const brand = await getBrand(message.store);
      return [
        {
          emails: [
            {
              to: message.email,
              template: event.type,
              rendered: templates.supportReplyEmail(brand, { customerName: message.name.split(" ")[0] ?? message.name, subject: message.subject, reply: reply.body, original: message.message }),
              replyTo: brand.supportEmail || undefined,
            },
          ],
        },
      ];
    }
  }
}

/**
 * Records in-app notifications and queues external deliveries. Returns the delivery ids so the caller can
 * send them after the response (Next.js `after`) or synchronously (scripts, tests).
 */
export async function dispatchNotification(event: NotificationEvent): Promise<string[]> {
  const planned = await plan(event);
  const deliveryIds: string[] = [];
  for (const item of planned) {
    const notification = item.inApp
      ? await db.notification.create({
          data: {
            audience: item.inApp.audience,
            userId: item.inApp.userId,
            type: item.inApp.type,
            title: item.inApp.title,
            body: item.inApp.body,
            href: item.inApp.href,
            data: item.inApp.data,
          },
        })
      : null;
    for (const email of item.emails ?? []) {
      const delivery = await db.notificationDelivery.create({
        data: {
          notificationId: notification?.id,
          channel: NotificationChannel.EMAIL,
          recipient: email.to,
          template: email.template,
          subject: email.rendered.subject,
          payload: { html: email.rendered.html, text: email.rendered.text, replyTo: email.replyTo } satisfies Prisma.InputJsonValue,
        },
      });
      deliveryIds.push(delivery.id);
    }
  }
  return deliveryIds;
}

/** Sends queued deliveries. Never throws — failures are recorded and retried with backoff. */
export async function sendDeliveries(ids: string[]) {
  for (const id of ids) {
    const claimed = await db.notificationDelivery.updateMany({
      where: { id, status: { in: [DeliveryStatus.PENDING, DeliveryStatus.FAILED] }, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 10 * 60_000) },
    });
    if (claimed.count === 0) continue;
    const delivery = await db.notificationDelivery.findUniqueOrThrow({ where: { id } });
    try {
      const payload = delivery.payload as { html?: string; text?: string; body?: string; title?: string; href?: string; replyTo?: string };
      let providerMessageId: string | null = null;
      if (delivery.channel === NotificationChannel.EMAIL) {
        const result = await getEmailProvider().send({
          to: delivery.recipient,
          subject: delivery.subject ?? "",
          html: payload.html ?? "",
          text: payload.text ?? "",
          replyTo: payload.replyTo,
          tag: delivery.template,
        });
        providerMessageId = result.id;
      } else if (delivery.channel === NotificationChannel.SMS) {
        const provider = getSmsProvider();
        if (!provider) {
          await db.notificationDelivery.update({ where: { id }, data: { status: DeliveryStatus.SKIPPED, lastError: "No SMS provider configured" } });
          continue;
        }
        providerMessageId = (await provider.send({ to: delivery.recipient, body: payload.body ?? payload.text ?? "" })).id;
      } else if (delivery.channel === NotificationChannel.PUSH) {
        const provider = getPushProvider();
        if (!provider) {
          await db.notificationDelivery.update({ where: { id }, data: { status: DeliveryStatus.SKIPPED, lastError: "No push provider configured" } });
          continue;
        }
        providerMessageId = (await provider.send({ to: delivery.recipient, title: payload.title ?? delivery.subject ?? "", body: payload.body ?? "", href: payload.href })).id;
      }
      await db.notificationDelivery.update({
        where: { id },
        data: { status: DeliveryStatus.SENT, sentAt: new Date(), providerMessageId, lastError: null },
      });
    } catch (error) {
      const attempt = delivery.attempts;
      const exhausted = attempt >= MAX_ATTEMPTS;
      const minutes = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];
      await db.notificationDelivery.update({
        where: { id },
        data: {
          status: DeliveryStatus.FAILED,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error),
          nextAttemptAt: exhausted ? new Date("9999-12-31") : new Date(Date.now() + minutes * 60_000),
        },
      });
      console.error(`[notifications] delivery ${id} failed (attempt ${attempt})`, error);
    }
  }
}

/** Cron entry point: retries due deliveries. */
export async function processDueDeliveries(limit = 50) {
  const due = await db.notificationDelivery.findMany({
    where: { status: { in: [DeliveryStatus.PENDING, DeliveryStatus.FAILED] }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  await sendDeliveries(due.map((row) => row.id));
  return due.length;
}

/** Dispatch and send immediately (scripts/tests or when `after` is unavailable). */
export async function notifyNow(event: NotificationEvent) {
  try {
    await sendDeliveries(await dispatchNotification(event));
  } catch (error) {
    console.error(`[notifications] failed to dispatch ${event.type}`, error);
  }
}
