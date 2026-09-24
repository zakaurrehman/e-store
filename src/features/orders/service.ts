import type { Prisma } from "@/generated/prisma/client";
import { InventoryReason, OrderEventType, OrderStatus, PaymentStatus, ShipmentStatus, TransactionStatus, TransactionType } from "@/generated/prisma/enums";
import { loadCart, toPricingLines, type CartView } from "@/features/cart/service";
import { invalidateProducts } from "@/features/catalog/invalidate";
import { adjustInventory, recomputeProductAggregates, recomputeProductSales } from "@/features/catalog/service";
import { validateCoupon } from "@/features/checkout/coupons";
import { calculateTotals } from "@/features/checkout/pricing";
import { calculateOrderFinance, currentCommissionRule } from "@/features/finance/service";
import { getShippingOptions, getTaxRate } from "@/features/checkout/shipping";
import type { PlaceOrderInput } from "@/features/checkout/schemas";
import { loadSettings } from "@/features/settings/service";
import { chargeOrderFulfilment, recogniseOrderRevenue, reverseOrderLedger, settleDeliveredOrder } from "@/features/wallet/service";
import type { AddressSnapshot } from "@/lib/address";
import { normalisePhone } from "@/lib/phone";
import { storeUrl } from "@/lib/tenancy";
import { writeAudit } from "@/server/audit";
import { db, type DbClient, type Tx } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { dispatchNotification, orderAccessToken, sendDeliveries, type NotificationEvent } from "@/server/notifications";
import { getPaymentProvider } from "@/server/payments/registry";
import type { OrderForPayment, PaymentEvent } from "@/server/payments/types";
import { hmacSha256, sha256 } from "@/server/security/crypto";
import { formatMoney } from "@/utils/money";
import { generateOrderNumber } from "./numbers";
import { CANCELLABLE_STATUSES, NEXT_STATUSES, ORDER_STATUS_LABELS, WAITING_FOR_ACCEPTANCE } from "./status";

export const UNPAID_ORDER_TTL_MS = 2 * 60 * 60 * 1000;

export class OrderError extends DomainError {}

/** Notifications are queued inside the business operation and sent by the caller after the response. */
export type OrderOutcome<T> = { result: T; notifications: NotificationEvent[] };

export async function flushNotifications(events: NotificationEvent[]) {
  for (const event of events) {
    try {
      await sendDeliveries(await dispatchNotification(event));
    } catch (error) {
      console.error(`[orders] notification ${event.type} failed`, error);
    }
  }
}

/** `createdAt` orders events written in one transaction, whose database clock reads the same for all of them. */
async function addEvent(client: DbClient, orderId: string, type: OrderEventType, message: string, options: { data?: Prisma.InputJsonValue; isInternal?: boolean; actorId?: string | null; createdAt?: Date } = {}) {
  return client.orderEvent.create({
    data: { orderId, type, message, data: options.data, isInternal: options.isInternal ?? false, actorId: options.actorId ?? null, ...(options.createdAt ? { createdAt: options.createdAt } : {}) },
  });
}

// ─── Checkout quote ──────────────────────────────────────────────────────────

export async function buildQuote(cart: CartView, customer: { userId: string | null; email: string | null }, destination: { country: string; region?: string | null }, shippingMethodId?: string | null) {
  const lines = toPricingLines(cart);
  const coupon = cart.couponCode ? await validateCoupon(cart.couponCode, { lines, userId: customer.userId, email: customer.email, storeId: cart.storeId }).catch(() => null) : null;
  const [options, taxRate] = await Promise.all([getShippingOptions(destination.country), getTaxRate(destination.country, destination.region)]);
  const method = options.find((option) => option.id === shippingMethodId) ?? options[0] ?? null;
  const totals = calculateTotals({ lines, coupon, shipping: method, tax: taxRate });
  return { lines, coupon, options, method, taxRate, totals };
}

// ─── Place order ─────────────────────────────────────────────────────────────

export type PlaceOrderResult = { orderId: string; orderNumber: string; paymentId: string | null; next: { kind: "redirect"; url: string } | { kind: "confirmation"; url: string } };

export async function placeOrder(
  input: PlaceOrderInput,
  context: { cartId: string; userId: string | null; ipAddress: string; appUrl: string },
): Promise<OrderOutcome<PlaceOrderResult>> {
  // Idempotency: a retried submit with the same key returns the original order.
  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (existing) {
    return { result: await resumePayment(existing.id, context.appUrl), notifications: [] };
  }

  const cart = await loadCart(context.cartId);
  if (!cart || cart.lines.length === 0) throw new OrderError("CART_EMPTY", "Your bag is empty.");
  if (cart.hasUnavailableItems) throw new OrderError("CART_UNAVAILABLE", "Some items in your bag are no longer available. Please review your bag.");

  const settings = await loadSettings();
  if (!context.userId && !settings.commerce.guestCheckout) throw new OrderError("GUEST_CHECKOUT_DISABLED", "Please sign in to check out.");

  // Addresses
  let shipping: AddressSnapshot;
  if (input.shippingAddressId) {
    if (!context.userId) throw new OrderError("ADDRESS_INVALID", "Please enter a shipping address.");
    const saved = await db.address.findFirst({ where: { id: input.shippingAddressId, userId: context.userId, deletedAt: null } });
    if (!saved) throw new OrderError("ADDRESS_INVALID", "That saved address is no longer available.");
    shipping = { firstName: saved.firstName, lastName: saved.lastName, company: saved.company, line1: saved.line1, line2: saved.line2, city: saved.city, region: saved.region, postalCode: saved.postalCode, country: saved.country, phone: saved.phone };
  } else if (input.shippingAddress) {
    shipping = input.shippingAddress;
  } else {
    throw new OrderError("ADDRESS_INVALID", "Please enter a shipping address.", { fieldErrors: { "shippingAddress.line1": ["Enter a street address."] } });
  }
  const billing: AddressSnapshot = input.billingSameAsShipping || !input.billingAddress ? shipping : input.billingAddress;

  // Pricing
  const lines = toPricingLines(cart);
  const coupon = cart.couponCode ? await validateCoupon(cart.couponCode, { lines, userId: context.userId, email: input.email, storeId: cart.storeId }) : null;
  const options = await getShippingOptions(shipping.country);
  const method = options.find((option) => option.id === input.shippingMethodId);
  if (!method) throw new OrderError("SHIPPING_INVALID", "Choose a delivery method for your address.", { fieldErrors: { shippingMethodId: ["Choose a delivery method."] } });
  const taxRate = await getTaxRate(shipping.country, shipping.region);
  const totals = calculateTotals({ lines, coupon, shipping: method, tax: taxRate });
  const lineByKey = new Map(cart.lines.map((line) => [line.variantId, line]));

  // The commission rule in force right now is stored on the order, so a later rate change never rewrites it.
  const store = await db.store.findUniqueOrThrow({ where: { id: cart.storeId }, select: { ownerId: true } });
  const commissionRule = await currentCommissionRule();
  const finance = calculateOrderFinance(
    {
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      shippingCents: totals.shippingCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      items: totals.lines.map((priced) => ({ unitCostCents: lineByKey.get(priced.key)!.unitCostCents, quantity: priced.quantity })),
    },
    // Zendropship's own store pays itself no commission.
    store.ownerId ? commissionRule : { ...commissionRule, rateBps: 0 },
  );

  const provider = getPaymentProvider(input.paymentProvider);
  if (!provider || !provider.isAvailable({ country: shipping.country, totalCents: totals.totalCents, currency: settings.store.currency })) {
    throw new OrderError("PAYMENT_METHOD_INVALID", "That payment method isn't available for this order.", { fieldErrors: { paymentProvider: ["Choose another payment method."] } });
  }

  const notifications: NotificationEvent[] = [];
  const isOffline = provider.flow === "offline";

  const order = await db.$transaction(
    async (tx) => {
      // Reserve stock atomically (fails if anything sold out since the cart was loaded).
      for (const priced of totals.lines) {
        await adjustInventory(tx, { variantId: priced.key, delta: -priced.quantity, reason: InventoryReason.ORDER_PLACED, guardNegative: true });
      }

      // Coupon usage limits are enforced here (atomic increment) — not only at validation time.
      if (coupon) {
        const updated = await tx.coupon.updateMany({
          where: { id: coupon.id, OR: [{ usageLimit: null }, { usedCount: { lt: tx.coupon.fields.usageLimit } }] },
          data: { usedCount: { increment: 1 } },
        });
        if (updated.count === 0) throw new OrderError("COUPON_USAGE_LIMIT", "That promo code has just reached its usage limit.");
      }

      let number = generateOrderNumber();
      while (await tx.order.findUnique({ where: { number }, select: { id: true } })) number = generateOrderNumber();

      const accessToken = hmacSha256(`order-access:${number}:${input.email.toLowerCase()}`);
      const created = await tx.order.create({
        data: {
          number,
          storeId: cart.storeId,
          userId: context.userId,
          email: input.email,
          phone: normalisePhone(input.phone ?? shipping.phone, shipping.country)?.e164 ?? input.phone ?? shipping.phone ?? null,
          status: isOffline ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          paymentProvider: provider.key,
          currency: settings.store.currency,
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          shippingCents: totals.shippingCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          fulfilmentCostCents: finance.fulfilmentCostCents,
          commissionRateBps: finance.commissionRateBps,
          commissionBase: finance.commissionBase,
          commissionCents: finance.commissionCents,
          ownerEarningCents: finance.ownerEarningCents,
          couponCode: coupon?.code ?? null,
          shippingAddress: shipping as Prisma.InputJsonValue,
          billingAddress: billing as Prisma.InputJsonValue,
          shippingMethodId: method.id,
          shippingMethodName: method.name,
          customerNote: input.customerNote,
          idempotencyKey: input.idempotencyKey,
          accessTokenHash: sha256(accessToken),
          items: {
            create: totals.lines.map((priced) => {
              const line = lineByKey.get(priced.key)!;
              return {
                productId: line.productId,
                variantId: line.variantId,
                productName: line.name,
                productSlug: line.slug,
                variantTitle: line.variantTitle,
                sku: line.sku,
                imageUrl: line.imageUrl,
                unitPriceCents: priced.unitPriceCents,
                unitCostCents: line.unitCostCents,
                quantity: priced.quantity,
                discountCents: priced.discountCents,
                taxCents: priced.taxCents,
                totalCents: priced.totalCents,
              };
            }),
          },
          payments: { create: { provider: provider.key, status: PaymentStatus.PENDING, amountCents: totals.totalCents, currency: settings.store.currency } },
        },
        include: { payments: true, items: true },
      });

      // Link inventory movements to the order for the ledger.
      await tx.inventoryMovement.updateMany({
        where: { orderId: null, reason: InventoryReason.ORDER_PLACED, variantId: { in: totals.lines.map((line) => line.key) }, createdAt: { gte: new Date(Date.now() - 60_000) } },
        data: { orderId: created.id },
      });

      if (coupon) {
        await tx.couponRedemption.create({ data: { couponId: coupon.id, orderId: created.id, userId: context.userId, email: input.email, discountCents: totals.discountCents } });
      }

      await addEvent(tx, created.id, OrderEventType.CREATED, `Order placed (${provider.label})`, { data: { ip: context.ipAddress } });
      if (isOffline) await addEvent(tx, created.id, OrderEventType.STATUS_CHANGED, "Order confirmed — payment on delivery", { data: { status: OrderStatus.CONFIRMED } });

      if (context.userId && input.saveAddress && !input.shippingAddressId) {
        const count = await tx.address.count({ where: { userId: context.userId, deletedAt: null } });
        await tx.address.create({ data: { ...shipping, userId: context.userId, isDefaultShipping: count === 0, isDefaultBilling: count === 0 } });
      }
      if (context.userId) {
        await tx.user.update({ where: { id: context.userId }, data: { phone: input.phone ?? undefined, ...(input.marketingOptIn ? { marketingOptIn: true } : {}) } });
      }
      if (input.marketingOptIn) {
        await tx.newsletterSubscriber.upsert({ where: { email: input.email }, create: { email: input.email, source: "checkout" }, update: { unsubscribedAt: null } });
      }

      // Empty the bag.
      await tx.cartItem.deleteMany({ where: { cartId: context.cartId } });
      await tx.cart.update({ where: { id: context.cartId }, data: { couponCode: null } });
      return created;
    },
    { timeout: 30_000 },
  );

  for (const line of totals.lines) await recomputeProductAggregates(lineByKey.get(line.key)!.productId);
  await invalidateProducts(totals.lines.map((line) => lineByKey.get(line.key)!.productId));

  if (isOffline) {
    await checkLowStock(order.items.map((item) => item.variantId).filter(Boolean) as string[], notifications);
    // Confirmed, and nothing more: the store owner decides when to accept it (see acceptOrder).
    notifications.push({ type: "order.confirmed", orderId: order.id });
    return { result: { orderId: order.id, orderNumber: order.number, paymentId: null, next: confirmationTarget(order) }, notifications };
  }

  const result = await startPayment(order.id, order.payments[0].id, context.appUrl);
  return { result, notifications };
}

/**
 * Where the customer goes once the order exists. The signed token is included so a guest — who has no
 * session and may not have their email yet — can open the page, refresh it, or come back to it later.
 */
function confirmationTarget(order: { number: string; email: string }): { kind: "confirmation"; url: string } {
  return { kind: "confirmation", url: `/checkout/confirmation/${order.number}?token=${orderAccessToken(order)}` };
}

/** The history line for an accepted order: who accepted it, what the goods cost, and where that money came from. */
function acceptedLine(by: OrderAcceptor["as"], chargedCents: number, fromBalanceCents: number, currency: string) {
  const accepted = by === "owner" ? "Accepted by the store owner" : "Accepted by Zendropship";
  if (chargedCents <= 0) return accepted;
  const fromOrder = chargedCents - fromBalanceCents;
  const cost = `${formatMoney(chargedCents, currency)} wholesale cost set aside`;
  if (fromBalanceCents <= 0) return `${accepted} — ${cost} from the customer's payment`;
  if (fromOrder <= 0) return `${accepted} — ${cost} from the store balance`;
  return `${accepted} — ${cost}: ${formatMoney(fromOrder, currency)} from the customer's payment, ${formatMoney(fromBalanceCents, currency)} from the store balance`;
}

/**
 * Who is accepting. An order in an owner's store is accepted by that owner and nobody else; an order in
 * Zendropship's own store, which has no owner and no balance, by Zendropship staff.
 */
export type OrderAcceptor = { userId: string; as: "owner" | "staff" };

export const INSUFFICIENT_BALANCE_MESSAGE = "Insufficient wallet balance to accept this order. Please add funds.";

export type AcceptOutcome = { already: true } | { already: false; number: string; chargedCents: number; fromBalanceCents: number };

/**
 * Accepts an order — the one way an order becomes Accepted, and only ever because someone chose to.
 * Nothing calls it on its own: not placing an order, not a payment or its webhook, not a deposit.
 *
 * In one transaction, with the order row locked so simultaneous clicks queue up behind each other:
 * checks who is accepting, sets the wholesale cost aside exactly once (from the customer's payment when
 * it has been collected, otherwise from the owner's available balance), records Accepted and moves the
 * order on to Processing. If the available balance cannot cover its part, nothing at all is written and
 * the owner is told to add funds; the order keeps waiting for them. An order that is already accepted
 * is left alone and reported as such, so a refresh, a retry or a second click changes nothing.
 */
export async function acceptOrder(orderId: string, acceptor: OrderAcceptor): Promise<{ outcome: AcceptOutcome; notifications: NotificationEvent[] }> {
  const outcome = await db.$transaction(async (tx): Promise<AcceptOutcome> => {
    await tx.$executeRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { number: true, status: true, currency: true, store: { select: { ownerId: true } } } });
    if (!order) throw new NotFoundError("Order not found.");

    const ownerId = order.store.ownerId;
    if (ownerId ? acceptor.as !== "owner" || acceptor.userId !== ownerId : acceptor.as !== "staff") {
      throw new OrderError("NOT_YOURS_TO_ACCEPT", ownerId ? "Only the store's owner can accept this order." : "Orders in Zendropship's own store are accepted by Zendropship staff.", { status: 403 });
    }
    if (order.status === OrderStatus.PENDING) throw new OrderError("UNPAID", "This order is still waiting for the customer's payment, so it can't be accepted yet.");
    if (order.status === OrderStatus.CANCELLED) throw new OrderError("CANCELLED", "This order was cancelled.");
    if (!WAITING_FOR_ACCEPTANCE.includes(order.status)) return { already: true };

    const funding = await chargeOrderFulfilment(tx, orderId);
    // Throwing rolls the whole transaction back: no status change, no ledger entry, nothing to undo.
    if (!funding.ok) throw new OrderError("INSUFFICIENT_BALANCE", INSUFFICIENT_BALANCE_MESSAGE, { status: 409 });

    const acceptedAt = new Date();
    await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.ACCEPTED, acceptedAt } });
    await addEvent(tx, orderId, OrderEventType.STATUS_CHANGED, acceptedLine(acceptor.as, funding.chargedCents, funding.fromBalanceCents, order.currency), {
      data: { status: OrderStatus.ACCEPTED, chargedCents: funding.chargedCents, fromBalanceCents: funding.fromBalanceCents },
      actorId: acceptor.userId,
      createdAt: acceptedAt,
    });
    // Accepting hands the order to fulfilment, which starts processing it; every step after this is taken by hand.
    await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.PROCESSING } });
    await addEvent(tx, orderId, OrderEventType.STATUS_CHANGED, `Status changed to ${ORDER_STATUS_LABELS.PROCESSING}`, {
      data: { status: OrderStatus.PROCESSING },
      actorId: acceptor.userId,
      createdAt: new Date(acceptedAt.getTime() + 1),
    });
    return { already: false, number: order.number, chargedCents: funding.chargedCents, fromBalanceCents: funding.fromBalanceCents };
  });

  if (outcome.already) return { outcome, notifications: [] };
  await writeAudit({
    actorId: acceptor.userId,
    action: "order.accept",
    entityType: "Order",
    entityId: orderId,
    summary: `Order ${outcome.number} accepted by the ${acceptor.as === "owner" ? "store owner" : "Zendropship staff"}${outcome.fromBalanceCents > 0 ? ` — ${formatMoney(outcome.fromBalanceCents)} set aside from the store balance` : ""}`,
  });
  return { outcome, notifications: [{ type: "order.accepted", orderId }] };
}

function toOrderForPayment(order: { id: string; number: string; email: string; currency: string; totalCents: number; shippingCents: number; taxCents: number; discountCents: number; items: Array<{ productName: string; variantTitle: string | null; quantity: number; unitPriceCents: number }> }): OrderForPayment {
  return {
    id: order.id,
    number: order.number,
    email: order.email,
    currency: order.currency,
    totalCents: order.totalCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    discountCents: order.discountCents,
    items: order.items.map((item) => ({ name: item.variantTitle ? `${item.productName} — ${item.variantTitle}` : item.productName, quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
  };
}

/**
 * Hands the customer to the payment provider. Return and cancel links point at the order's own store domain,
 * because checkout pages only exist on store hosts; `appUrl` is kept for callers and used for orders without a store slug.
 */
async function startPayment(orderId: string, paymentId: string, appUrl: string): Promise<PlaceOrderResult> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, store: { select: { slug: true } } } });
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const provider = getPaymentProvider(payment.provider);
  if (!provider) throw new OrderError("PAYMENT_METHOD_INVALID", "This payment method is no longer available.");
  const origin = order.store?.slug ? storeUrl(order.store.slug) : appUrl;
  const returnUrl = new URL(`/checkout/return/${provider.key}?order=${order.number}&payment=${payment.id}`, origin).toString();
  const cancelUrl = new URL(`/checkout/return/${provider.key}?order=${order.number}&payment=${payment.id}&cancelled=1`, origin).toString();

  const initiated = await provider.initiate({ order: toOrderForPayment(order), paymentId: payment.id, returnUrl, cancelUrl });
  await db.payment.update({ where: { id: payment.id }, data: { providerReference: initiated.providerReference, status: PaymentStatus.PROCESSING } });
  await addEvent(db, order.id, OrderEventType.PAYMENT, `Payment started with ${provider.label}`, { data: { paymentId: payment.id, providerReference: initiated.providerReference } });
  if (initiated.kind === "redirect") {
    return { orderId: order.id, orderNumber: order.number, paymentId: payment.id, next: { kind: "redirect", url: initiated.url } };
  }
  return { orderId: order.id, orderNumber: order.number, paymentId: payment.id, next: confirmationTarget(order) };
}

/** Re-opens payment for an unpaid order (failed/expired/abandoned attempts create a fresh Payment). */
export async function resumePayment(orderId: string, appUrl: string, providerKey?: string): Promise<PlaceOrderResult> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (order.paymentStatus === PaymentStatus.PAID || order.status === OrderStatus.CANCELLED) {
    return { orderId: order.id, orderNumber: order.number, paymentId: null, next: confirmationTarget(order) };
  }
  const provider = getPaymentProvider(providerKey ?? order.paymentProvider);
  if (!provider) throw new OrderError("PAYMENT_METHOD_INVALID", "This payment method is no longer available.");
  if (provider.flow === "offline") {
    // Confirmed only; accepting it stays the store owner's decision.
    await db.order.update({ where: { id: order.id }, data: { paymentProvider: provider.key, status: OrderStatus.CONFIRMED } });
    return { orderId: order.id, orderNumber: order.number, paymentId: null, next: confirmationTarget(order) };
  }
  const reusable = order.payments.find((payment) => payment.provider === provider.key && payment.status === PaymentStatus.PENDING);
  const payment = reusable ?? (await db.payment.create({ data: { orderId: order.id, provider: provider.key, status: PaymentStatus.PENDING, amountCents: order.totalCents, currency: order.currency } }));
  if (order.paymentProvider !== provider.key) await db.order.update({ where: { id: order.id }, data: { paymentProvider: provider.key } });
  return startPayment(order.id, payment.id, appUrl);
}

// ─── Payment events (webhooks / verified returns) ────────────────────────────

export async function applyPaymentEvent(providerKey: string, event: PaymentEvent): Promise<NotificationEvent[]> {
  const payment = await db.payment.findUnique({ where: { provider_providerReference: { provider: providerKey, providerReference: event.providerReference } }, include: { order: true } });
  if (!payment) {
    console.warn(`[payments] ${providerKey} event for unknown reference ${event.providerReference}`);
    return [];
  }
  const notifications: NotificationEvent[] = [];
  const { order } = payment;

  switch (event.type) {
    case "payment.succeeded": {
      if (payment.status === PaymentStatus.PAID) return [];
      if (event.amountCents !== null && event.amountCents < payment.amountCents) {
        await addEvent(db, order.id, OrderEventType.SYSTEM, `Payment amount mismatch: received ${event.amountCents}, expected ${payment.amountCents}`, { isInternal: true });
        return [];
      }
      await db.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID, capturedCents: payment.amountCents } });
        await tx.paymentTransaction.create({ data: { paymentId: payment.id, type: TransactionType.CHARGE, status: TransactionStatus.SUCCEEDED, amountCents: payment.amountCents, providerTransactionId: event.transactionId, raw: (event.raw ?? undefined) as Prisma.InputJsonValue | undefined } });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.PAID, paidAt: new Date(), status: order.status === OrderStatus.PENDING ? OrderStatus.CONFIRMED : order.status },
        });
        await addEvent(tx, order.id, OrderEventType.PAYMENT, `Payment confirmed via ${providerKey}`, { data: { transactionId: event.transactionId } });
        if (order.status === OrderStatus.PENDING) await addEvent(tx, order.id, OrderEventType.STATUS_CHANGED, "Order confirmed", { data: { status: OrderStatus.CONFIRMED } });
      });
      const items = await db.orderItem.findMany({ where: { orderId: order.id }, select: { productId: true, variantId: true } });
      await recomputeProductSales(items.map((item) => item.productId).filter(Boolean) as string[]);
      await invalidateProducts(items.map((item) => item.productId));
      await checkLowStock(items.map((item) => item.variantId).filter(Boolean) as string[], notifications);
      await recogniseOrderRevenue(order.id);
      // A confirmed payment confirms the order — it does not accept it. That is the store owner's decision.
      notifications.push(order.status === OrderStatus.PENDING ? { type: "order.confirmed", orderId: order.id } : { type: "order.payment-received", orderId: order.id });
      break;
    }
    case "payment.failed": {
      if (payment.status === PaymentStatus.PAID) return [];
      await db.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, failureReason: event.reason } });
        await tx.paymentTransaction.create({ data: { paymentId: payment.id, type: TransactionType.CHARGE, status: TransactionStatus.FAILED, amountCents: payment.amountCents, providerTransactionId: event.transactionId, reason: event.reason, raw: (event.raw ?? undefined) as Prisma.InputJsonValue | undefined } });
        if (order.paymentStatus !== PaymentStatus.PAID) await tx.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.FAILED } });
        await addEvent(tx, order.id, OrderEventType.PAYMENT, `Payment failed: ${event.reason ?? "unknown reason"}`);
      });
      notifications.push({ type: "order.payment-failed", orderId: order.id, reason: event.reason ?? undefined });
      break;
    }
    case "payment.pending": {
      if (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.PROCESSING) {
        await db.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PROCESSING } });
        await db.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.PROCESSING } });
      }
      break;
    }
    case "refund.succeeded": {
      // Refunds initiated from the admin are recorded there; provider-initiated refunds (dashboard) are reconciled here.
      const already = event.transactionId ? await db.paymentTransaction.findFirst({ where: { providerTransactionId: event.transactionId, type: TransactionType.REFUND } }) : null;
      if (already) return [];
      await recordRefund(payment.id, event.amountCents, event.transactionId, "Refund reported by payment provider", null, notifications);
      break;
    }
  }
  return notifications;
}

/** Stores the inbound webhook once and processes it; duplicate deliveries are acknowledged without side effects. */
export async function processWebhook(providerKey: string, request: Request) {
  const provider = getPaymentProvider(providerKey);
  if (!provider) throw new NotFoundError("Unknown payment provider");
  const outcome = await provider.handleWebhook(request);
  const stored = await db.webhookEvent.upsert({
    where: { provider_eventId: { provider: providerKey, eventId: outcome.eventId } },
    create: { provider: providerKey, eventId: outcome.eventId, type: outcome.eventType, payload: outcome.payload as Prisma.InputJsonValue },
    update: {},
  });
  if (stored.processedAt) return { duplicate: true, notifications: [] as NotificationEvent[] };
  const notifications: NotificationEvent[] = [];
  try {
    for (const event of outcome.events) notifications.push(...(await applyPaymentEvent(providerKey, event)));
    await db.webhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date(), error: null } });
  } catch (error) {
    await db.webhookEvent.update({ where: { id: stored.id }, data: { error: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
  return { duplicate: false, notifications };
}

async function checkLowStock(variantIds: string[], notifications: NotificationEvent[]) {
  if (variantIds.length === 0) return;
  const low = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "ProductVariant" WHERE "id" = ANY(${variantIds}) AND "trackInventory" AND "stockQuantity" <= "lowStockThreshold"`;
  if (low.length) notifications.push({ type: "inventory.low-stock", variantIds: low.map((row) => row.id) });
}

// ─── Fulfilment & admin operations ───────────────────────────────────────────

export async function updateOrderStatus(orderId: string, status: OrderStatus, actorId: string, note?: string): Promise<NotificationEvent[]> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!NEXT_STATUSES[order.status].includes(status)) {
    throw new OrderError("INVALID_TRANSITION", `Can't move an order from ${ORDER_STATUS_LABELS[order.status]} to ${ORDER_STATUS_LABELS[status]}.`);
  }
  if (status === OrderStatus.CONFIRMED && order.paymentStatus !== PaymentStatus.PAID && order.paymentProvider !== "cod") {
    throw new OrderError("UNPAID", "Record the payment before confirming this order.");
  }
  // Accepting moves money and belongs to the store owner, so no status change can stand in for it.
  if (status === OrderStatus.ACCEPTED) {
    throw new OrderError("ACCEPT_SEPARATELY", "Orders are accepted with Accept — by the store owner, or by Zendropship for its own store.");
  }
  const notifications: NotificationEvent[] = [];
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status, ...(status === OrderStatus.DELIVERED ? { deliveredAt: new Date() } : {}) } });
    await addEvent(tx, orderId, OrderEventType.STATUS_CHANGED, `Status changed to ${ORDER_STATUS_LABELS[status]}${note ? ` — ${note}` : ""}`, { data: { status }, actorId });
    if (status === OrderStatus.SHIPPED || status === OrderStatus.OUT_FOR_DELIVERY || status === OrderStatus.DELIVERED) {
      const shipmentStatus = status === OrderStatus.SHIPPED ? ShipmentStatus.SHIPPED : status === OrderStatus.OUT_FOR_DELIVERY ? ShipmentStatus.OUT_FOR_DELIVERY : ShipmentStatus.DELIVERED;
      const existing = await tx.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
      if (existing) {
        await tx.shipment.update({ where: { id: existing.id }, data: { status: shipmentStatus, shippedAt: existing.shippedAt ?? (status === OrderStatus.SHIPPED ? new Date() : null), deliveredAt: status === OrderStatus.DELIVERED ? new Date() : existing.deliveredAt } });
      } else {
        await tx.shipment.create({ data: { orderId, status: shipmentStatus, shippedAt: new Date(), deliveredAt: status === OrderStatus.DELIVERED ? new Date() : null } });
      }
    }
    // Delivered: the order's held money becomes the owner's, in the same transaction as the status, so an
    // order can never be delivered with its money still held — or its money released without delivery.
    if (status === OrderStatus.DELIVERED) await settleDeliveredOrder(orderId, tx);
  });
  await writeAudit({ actorId, action: "order.status", entityType: "Order", entityId: orderId, summary: `Order ${order.number} → ${ORDER_STATUS_LABELS[status]}` });
  if (status === OrderStatus.SHIPPED) {
    const shipment = await db.shipment.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" } });
    notifications.push({ type: "order.shipped", orderId, shipmentId: shipment.id });
  }
  if (status === OrderStatus.DELIVERED) notifications.push({ type: "order.delivered", orderId });
  return notifications;
}

export async function setShipmentTracking(orderId: string, input: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null }, actorId: string) {
  const existing = await db.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
  const data = { carrier: input.carrier?.trim() || null, trackingNumber: input.trackingNumber?.trim() || null, trackingUrl: input.trackingUrl?.trim() || null };
  const shipment = existing ? await db.shipment.update({ where: { id: existing.id }, data }) : await db.shipment.create({ data: { orderId, ...data } });
  await addEvent(db, orderId, OrderEventType.SHIPMENT, data.trackingNumber ? `Tracking added: ${data.carrier ?? ""} ${data.trackingNumber}`.trim() : "Shipment details updated", { data, actorId });
  return shipment;
}

export async function addOrderNote(orderId: string, message: string, actorId: string, isInternal = true) {
  const clean = message.trim();
  if (!clean) throw new OrderError("EMPTY_NOTE", "Enter a note.");
  return addEvent(db, orderId, OrderEventType.NOTE, clean.slice(0, 2000), { isInternal, actorId });
}

export async function markPaidManually(orderId: string, actorId: string, note?: string): Promise<NotificationEvent[]> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (order.paymentStatus === PaymentStatus.PAID) return [];
  await db.$transaction(async (tx) => {
    const payment = order.payments[0] ?? (await tx.payment.create({ data: { orderId, provider: order.paymentProvider, status: PaymentStatus.PENDING, amountCents: order.totalCents, currency: order.currency } }));
    await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID, capturedCents: order.totalCents } });
    await tx.paymentTransaction.create({ data: { paymentId: payment.id, type: TransactionType.CHARGE, status: TransactionStatus.SUCCEEDED, amountCents: order.totalCents, reason: note ?? "Marked as paid by staff", actorId } });
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PAID, paidAt: new Date(), status: order.status === OrderStatus.PENDING ? OrderStatus.CONFIRMED : order.status } });
    await addEvent(tx, orderId, OrderEventType.PAYMENT, `Marked as paid${note ? ` — ${note}` : ""}`, { actorId });
    if (order.status === OrderStatus.PENDING) await addEvent(tx, orderId, OrderEventType.STATUS_CHANGED, "Order confirmed", { data: { status: OrderStatus.CONFIRMED }, actorId });
  });
  await writeAudit({ actorId, action: "order.mark_paid", entityType: "Order", entityId: orderId, summary: `Order ${order.number} marked as paid` });
  const items = await db.orderItem.findMany({ where: { orderId }, select: { productId: true } });
  await recomputeProductSales(items.map((item) => item.productId).filter(Boolean) as string[]);
  await invalidateProducts(items.map((item) => item.productId));
  // The money is in: record the sale, held until delivery. Accepting the order stays the store owner's decision.
  await recogniseOrderRevenue(orderId);
  return order.status === OrderStatus.PENDING ? [{ type: "order.confirmed", orderId }] : [{ type: "order.payment-received", orderId }];
}

async function recordRefund(paymentId: string, amountCents: number, transactionId: string | null, reason: string, actorId: string | null, notifications: NotificationEvent[], client: DbClient = db) {
  const payment = await client.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
  const refundedCents = payment.refundedCents + amountCents;
  const fullyRefunded = refundedCents >= payment.capturedCents && payment.capturedCents > 0;
  await client.payment.update({ where: { id: paymentId }, data: { refundedCents, status: fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED } });
  await client.paymentTransaction.create({ data: { paymentId, type: TransactionType.REFUND, status: TransactionStatus.SUCCEEDED, amountCents, providerTransactionId: transactionId, reason, actorId } });
  const orderRefunded = payment.order.refundedCents + amountCents;
  await client.order.update({
    where: { id: payment.orderId },
    data: { refundedCents: orderRefunded, paymentStatus: orderRefunded >= payment.order.totalCents ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED },
  });
  await addEvent(client, payment.orderId, OrderEventType.REFUND, `Refunded ${(amountCents / 100).toFixed(2)} ${payment.currency} — ${reason}`, { actorId, data: { amountCents, transactionId } });
  await reverseOrderLedger(payment.orderId, { refundedCents: orderRefunded, reason: "refunded", actorId, client });
  notifications.push({ type: "order.refunded", orderId: payment.orderId, amountCents });
}

export async function refundOrder(orderId: string, amountCents: number, reason: string, actorId: string): Promise<NotificationEvent[]> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { where: { status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] } }, include: { transactions: true } } } });
  const payment = order.payments[0];
  if (!payment) throw new OrderError("NOT_PAID", "This order has no captured payment to refund.");
  const refundable = payment.capturedCents - payment.refundedCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new OrderError("INVALID_AMOUNT", "Enter a refund amount.");
  if (amountCents > refundable) throw new OrderError("INVALID_AMOUNT", `You can refund up to ${(refundable / 100).toFixed(2)} ${order.currency}.`);
  const provider = getPaymentProvider(payment.provider);
  if (!provider) throw new OrderError("PAYMENT_METHOD_INVALID", "The payment provider for this order is no longer configured.");

  const capture = payment.transactions.find((transaction) => transaction.type === TransactionType.CHARGE && transaction.status === TransactionStatus.SUCCEEDED);
  const pendingTransaction = await db.paymentTransaction.create({ data: { paymentId: payment.id, type: TransactionType.REFUND, status: TransactionStatus.PENDING, amountCents, reason, actorId } });
  let result: Awaited<ReturnType<typeof provider.refund>>;
  try {
    result = await provider.refund({ providerReference: payment.providerReference ?? "", captureId: capture?.providerTransactionId ?? null, amountCents, currency: order.currency, reason });
  } catch (error) {
    await db.paymentTransaction.update({ where: { id: pendingTransaction.id }, data: { status: TransactionStatus.FAILED, reason: error instanceof Error ? error.message : String(error) } });
    throw new OrderError("REFUND_FAILED", "The payment provider rejected the refund. Check the provider dashboard and try again.");
  }
  await db.paymentTransaction.delete({ where: { id: pendingTransaction.id } });
  const notifications: NotificationEvent[] = [];
  await db.$transaction(async (tx) => {
    await recordRefund(payment.id, amountCents, result.transactionId, reason, actorId, notifications, tx);
  });
  await writeAudit({ actorId, action: "order.refund", entityType: "Order", entityId: orderId, summary: `Refunded ${(amountCents / 100).toFixed(2)} ${order.currency} on ${order.number}` });
  return notifications;
}

/** Cancels an order, restocks items and (when paid) refunds in full. */
export async function cancelOrder(orderId: string, reason: string, actorId: string | null, options: { refund?: boolean } = {}): Promise<NotificationEvent[]> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, payments: true } });
  if (!CANCELLABLE_STATUSES.includes(order.status)) throw new OrderError("NOT_CANCELLABLE", `Orders that are ${ORDER_STATUS_LABELS[order.status].toLowerCase()} can't be cancelled.`);
  const notifications: NotificationEvent[] = [];
  let refunded = false;
  if (order.paymentStatus === PaymentStatus.PAID && (options.refund ?? true) && actorId) {
    const paid = order.payments.find((payment) => payment.status === PaymentStatus.PAID);
    if (paid) {
      notifications.push(...(await refundOrder(orderId, paid.capturedCents - paid.refundedCents, `Order cancelled: ${reason}`, actorId)));
      refunded = true;
    }
  }
  await db.$transaction(async (tx) => {
    await restockOrder(tx, order, actorId);
    await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED, cancelledAt: new Date(), paymentStatus: order.paymentStatus === PaymentStatus.PAID ? PaymentStatus.REFUNDED : order.paymentStatus === PaymentStatus.PENDING || order.paymentStatus === PaymentStatus.PROCESSING || order.paymentStatus === PaymentStatus.FAILED ? PaymentStatus.CANCELLED : order.paymentStatus } });
    await tx.payment.updateMany({ where: { orderId, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.FAILED] } }, data: { status: PaymentStatus.CANCELLED } });
    await addEvent(tx, orderId, OrderEventType.STATUS_CHANGED, `Order cancelled — ${reason}`, { data: { status: OrderStatus.CANCELLED }, actorId });
  });
  // A cancelled order earns the owner nothing (a refund has already reversed it when one was issued).
  await reverseOrderLedger(orderId, { reason: "cancelled", actorId });
  for (const item of order.items) if (item.productId) await recomputeProductAggregates(item.productId);
  await invalidateProducts(order.items.map((item) => item.productId));
  if (actorId) await writeAudit({ actorId, action: "order.cancel", entityType: "Order", entityId: orderId, summary: `Order ${order.number} cancelled: ${reason}` });
  notifications.push({ type: "order.cancelled", orderId, reason, refunded });
  return notifications;
}

async function restockOrder(tx: Tx, order: { id: string; inventoryReleased: boolean; items: Array<{ variantId: string | null; quantity: number }> }, actorId: string | null) {
  if (order.inventoryReleased) return;
  for (const item of order.items) {
    if (!item.variantId) continue;
    const variant = await tx.productVariant.findUnique({ where: { id: item.variantId }, select: { id: true } });
    if (variant) await adjustInventory(tx, { variantId: item.variantId, delta: item.quantity, reason: InventoryReason.ORDER_CANCELLED, orderId: order.id, actorId });
  }
  await tx.order.update({ where: { id: order.id }, data: { inventoryReleased: true } });
}

/** Cron: releases stock held by orders whose online payment never completed. */
export async function expireUnpaidOrders(): Promise<{ expired: number; notifications: NotificationEvent[] }> {
  const cutoff = new Date(Date.now() - UNPAID_ORDER_TTL_MS);
  const stale = await db.order.findMany({
    where: { status: OrderStatus.PENDING, paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.FAILED] }, paymentProvider: { not: "cod" }, placedAt: { lt: cutoff } },
    select: { id: true },
    take: 100,
  });
  const notifications: NotificationEvent[] = [];
  for (const order of stale) {
    try {
      notifications.push(...(await cancelOrder(order.id, "Payment was not completed within 2 hours", null, { refund: false })));
    } catch (error) {
      console.error(`[orders] failed to expire ${order.id}`, error);
    }
  }
  return { expired: stale.length, notifications };
}
