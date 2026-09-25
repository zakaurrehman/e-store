"use server";

import { after } from "next/server";
import { z } from "zod";
import { loadCart } from "@/features/cart/service";
import { getCurrentCartId } from "@/features/cart/session";
import { getCurrentStore } from "@/features/stores/current";
import { buildQuote, flushNotifications, placeOrder, resumePayment } from "@/features/orders/service";
import { deliveryEstimate } from "@/features/checkout/shipping";
import { loadSettings } from "@/features/settings/service";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { isDomainError } from "@/server/errors";
import { availablePaymentMethods, type PaymentMethodOption } from "@/server/payments/registry";
import { getRequestMeta } from "@/server/request";
import { rateLimitByIp, retryAfterMessage } from "@/server/security/rate-limit";
import { placeOrderSchema, quoteSchema } from "./schemas";

export type CheckoutQuote = {
  shippingOptions: Array<{ id: string; name: string; description: string | null; priceCents: number; estimate: string; isFree: boolean }>;
  selectedShippingId: string | null;
  paymentMethods: PaymentMethodOption[];
  totals: { subtotalCents: number; discountCents: number; shippingCents: number; taxCents: number; totalCents: number };
  taxLabel: string | null;
  couponCode: string | null;
  itemCount: number;
  canShip: boolean;
};

export async function getCheckoutQuoteAction(input: { country: string; region?: string; shippingMethodId?: string }): Promise<{ ok: true; quote: CheckoutQuote } | { ok: false; error: string }> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a destination country." };
  const store = await getCurrentStore();
  const cartId = store ? await getCurrentCartId(store.id) : null;
  const cart = cartId ? await loadCart(cartId) : null;
  if (!cart || cart.lines.length === 0) return { ok: false, error: "Your bag is empty." };
  const user = await getCurrentUser();
  const settings = await loadSettings();
  const quote = await buildQuote(cart, { userId: user?.id ?? null, email: user?.email ?? null }, { country: parsed.data.country, region: parsed.data.region }, parsed.data.shippingMethodId);
  const shippingOptions = quote.options.map((option) => {
    const priced = quote.method?.id === option.id ? quote.totals.shippingCents : null;
    const withThis = priced ?? Math.max(0, quote.totals.subtotalCents - quote.totals.discountCents >= (option.freeOverCents ?? Infinity) ? 0 : option.priceCents);
    return { id: option.id, name: option.name, description: option.description, priceCents: withThis, estimate: deliveryEstimate(option), isFree: withThis === 0 };
  });
  return {
    ok: true,
    quote: {
      shippingOptions,
      selectedShippingId: quote.method?.id ?? null,
      paymentMethods: availablePaymentMethods({ country: parsed.data.country, totalCents: quote.totals.totalCents, currency: settings.store.currency }),
      totals: { subtotalCents: quote.totals.subtotalCents, discountCents: quote.totals.discountCents, shippingCents: quote.totals.shippingCents, taxCents: quote.totals.taxCents, totalCents: quote.totals.totalCents },
      taxLabel: quote.taxRate ? `${quote.taxRate.name} (${(quote.taxRate.rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)` : null,
      couponCode: quote.coupon?.code ?? null,
      itemCount: cart.itemCount,
      canShip: quote.options.length > 0,
    },
  };
}

export type PlaceOrderActionResult =
  | { ok: true; orderNumber: string; redirectUrl: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; code?: string };

export async function placeOrderAction(input: unknown): Promise<PlaceOrderActionResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  const meta = await getRequestMeta();
  const limit = await rateLimitByIp("checkout", meta.ipAddress);
  if (!limit.success) return { ok: false, error: retryAfterMessage(limit.resetAt) };

  const store = await getCurrentStore();
  const cartId = store ? await getCurrentCartId(store.id) : null;
  if (!cartId) return { ok: false, error: "Your bag is empty.", code: "CART_EMPTY" };
  const user = await getCurrentUser();
  try {
    const { result, notifications } = await placeOrder(parsed.data, { cartId, userId: user?.id ?? null, ipAddress: meta.ipAddress, appUrl: env.APP_URL });
    if (notifications.length) after(() => flushNotifications(notifications));
    return { ok: true, orderNumber: result.orderNumber, redirectUrl: result.next.url };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, error: error.message, fieldErrors: error.fieldErrors, code: error.code };
    console.error("[checkout] place order failed", error);
    return { ok: false, error: "We couldn't place your order. You have not been charged — please try again." };
  }
}

const retrySchema = z.object({ orderNumber: z.string().min(5).max(20), token: z.string().optional(), provider: z.string().max(20).optional() });

/** Retry payment for an unpaid order (owner via session, or guest via the emailed access token). */
export async function retryPaymentAction(input: { orderNumber: string; token?: string; provider?: string }): Promise<PlaceOrderActionResult> {
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Order not found." };
  const user = await getCurrentUser();
  const order = await db.order.findUnique({ where: { number: parsed.data.orderNumber.toUpperCase() } });
  if (!order) return { ok: false, error: "Order not found." };
  const { hmacSha256, safeEqual } = await import("@/server/security/crypto");
  const ownsViaSession = !!user && order.userId === user.id;
  const ownsViaToken = !!parsed.data.token && safeEqual(hmacSha256(`order-access:${order.number}:${order.email.toLowerCase()}`), parsed.data.token);
  if (!ownsViaSession && !ownsViaToken) return { ok: false, error: "Order not found." };
  try {
    const result = await resumePayment(order.id, env.APP_URL, parsed.data.provider);
    return { ok: true, orderNumber: order.number, redirectUrl: result.next.url };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, error: error.message };
    console.error("[checkout] retry payment failed", error);
    return { ok: false, error: "We couldn't restart the payment. Please try again." };
  }
}
