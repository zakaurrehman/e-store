import { describe, expect, it } from "vitest";
import { cancelOrder, placeOrder, processWebhook } from "@/features/orders/service";
import { OrderStatus, PaymentStatus, TransactionStatus, TransactionType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { WebhookVerificationError } from "@/server/payments/types";
import { createProduct, guestCartWith, orderContext, orderInput, sandboxGateway } from "./helpers";

async function placeSandboxOrder(stock = 10, quantity = 2) {
  const { variant } = await createProduct({ priceCents: 4200, stock });
  const cart = await guestCartWith([{ variantId: variant.id, quantity }]);
  const input = await orderInput();
  const outcome = await placeOrder(input, orderContext(cart.id));
  const order = await db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId }, include: { payments: true } });
  return { variant, cart, input, outcome, order, payment: order.payments[0] };
}

const stockOf = async (variantId: string) => (await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQuantity;

describe("checkout and payments", () => {
  it("reserves stock and leaves an online-payment order unpaid until a verified webhook arrives", async () => {
    const { variant, outcome, order, payment } = await placeSandboxOrder(10, 2);
    expect(outcome.result.next.kind).toBe("redirect");
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.paymentStatus).not.toBe(PaymentStatus.PAID);
    expect(payment?.providerReference).toBeTruthy();
    expect(await stockOf(variant.id)).toBe(8);
  });

  it("is idempotent: resubmitting with the same key returns the original order and reserves stock once", async () => {
    const { variant, cart, input, order } = await placeSandboxOrder(10, 2);
    const again = await placeOrder(input, orderContext(cart.id));
    expect(again.result.orderId).toBe(order.id);
    expect(await db.order.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    expect(await stockOf(variant.id)).toBe(8);
  });

  it("rejects unsigned and forged webhooks and never marks the order paid", async () => {
    const { order, payment } = await placeSandboxOrder();
    const body = JSON.stringify({ id: "evt_forged", type: "succeeded", providerReference: payment!.providerReference, amountCents: order.totalCents, currency: order.currency });
    const url = "http://localhost:3100/api/payments/webhooks/sandbox";
    const unsigned = new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body });
    const forged = new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-sandbox-signature": "0".repeat(64) }, body });

    await expect(processWebhook("sandbox", unsigned)).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(processWebhook("sandbox", forged)).rejects.toBeInstanceOf(WebhookVerificationError);

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.paymentStatus).not.toBe(PaymentStatus.PAID);
    expect(after.status).toBe(OrderStatus.PENDING);
    expect(await db.webhookEvent.count()).toBe(0);
  });

  it("confirms the order only after a signed success webhook and ignores duplicate deliveries", async () => {
    const { order, payment } = await placeSandboxOrder();
    const delivery = () =>
      sandboxGateway().buildWebhookRequest({ id: "evt_success_1", type: "succeeded", providerReference: payment!.providerReference!, amountCents: order.totalCents, currency: order.currency });

    const first = await processWebhook("sandbox", delivery());
    expect(first.duplicate).toBe(false);
    const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.paymentStatus).toBe(PaymentStatus.PAID);
    // The platform's own store has no balance to charge, so fulfilment takes the order at once.
    expect(paid.status).toBe(OrderStatus.ACCEPTED);

    const second = await processWebhook("sandbox", delivery());
    expect(second.duplicate).toBe(true);
    expect(await db.paymentTransaction.count({ where: { paymentId: payment!.id, type: TransactionType.CHARGE, status: TransactionStatus.SUCCEEDED } })).toBe(1);
  });

  it("does not mark an order paid when the confirmed amount is lower than the order total", async () => {
    const { order, payment } = await placeSandboxOrder();
    await processWebhook(
      "sandbox",
      sandboxGateway().buildWebhookRequest({ id: "evt_underpaid", type: "succeeded", providerReference: payment!.providerReference!, amountCents: order.totalCents - 1, currency: order.currency }),
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).not.toBe(PaymentStatus.PAID);
  });

  it("records a failed payment without confirming the order", async () => {
    const { order, payment } = await placeSandboxOrder();
    await processWebhook(
      "sandbox",
      sandboxGateway().buildWebhookRequest({ id: "evt_failed", type: "failed", providerReference: payment!.providerReference!, amountCents: order.totalCents, currency: order.currency, reason: "Card declined" }),
    );
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.paymentStatus).toBe(PaymentStatus.FAILED);
    expect(after.status).toBe(OrderStatus.PENDING);
  });

  it("refuses to oversell when stock drops after the item was added to the bag", async () => {
    const { variant } = await createProduct({ stock: 3 });
    const cart = await guestCartWith([{ variantId: variant.id, quantity: 3 }]);
    await db.productVariant.update({ where: { id: variant.id }, data: { stockQuantity: 1 } });

    const input = await orderInput();
    await expect(placeOrder(input, orderContext(cart.id))).rejects.toMatchObject({ code: expect.stringMatching(/OUT_OF_STOCK|CART_UNAVAILABLE/) });
    expect(await stockOf(variant.id)).toBe(1);
    expect(await db.order.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0);
  });

  it("returns reserved stock exactly once when an order is cancelled", async () => {
    const { variant, order } = await placeSandboxOrder(5, 2);
    expect(await stockOf(variant.id)).toBe(3);

    await cancelOrder(order.id, "Customer changed their mind", null, { refund: false });
    expect(await stockOf(variant.id)).toBe(5);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.CANCELLED);

    await cancelOrder(order.id, "Duplicate cancel", null, { refund: false }).catch(() => undefined);
    expect(await stockOf(variant.id)).toBe(5);
  });

  it("confirms cash-on-delivery orders without recording them as paid", async () => {
    const { variant } = await createProduct({ priceCents: 3000, stock: 4 });
    const cart = await guestCartWith([{ variantId: variant.id, quantity: 1 }]);
    const outcome = await placeOrder(await orderInput({ paymentProvider: "cod" }), orderContext(cart.id));
    expect(outcome.result.next.kind).toBe("confirmation");
    const order = await db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
    expect(order.status).toBe(OrderStatus.ACCEPTED);
    expect(order.paymentStatus).not.toBe(PaymentStatus.PAID);
  });
});
