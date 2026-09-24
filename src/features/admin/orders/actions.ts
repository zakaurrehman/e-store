"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";
import { acceptOrder, addOrderNote, cancelOrder, flushNotifications, markPaidManually, refundOrder, setShipmentTracking, updateOrderStatus } from "@/features/orders/service";
import { failure, handleActionError, success, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { dispatchNotification, sendDeliveries, type NotificationEvent } from "@/server/notifications";
import { parseMoneyToCents } from "@/utils/money";

function refresh(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

/**
 * Staff accept an order in Zendropship's own store, which has no owner to do it. An order in an owner's
 * store is refused here: accepting it is the owner's decision, made from their dashboard.
 */
export async function acceptOrderAction(orderId: string): Promise<ActionState> {
  try {
    const user = await assertPermission("orders.update");
    const { outcome, notifications } = await acceptOrder(String(orderId).slice(0, 40), { userId: user.id, as: "staff" });
    if (notifications.length) after(() => flushNotifications(notifications));
    refresh(orderId);
    return success(outcome.already ? "This order is already accepted." : "Order accepted — it is now in processing.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setOrderStatusAction(orderId: string, status: string, note?: string): Promise<ActionState> {
  try {
    const user = await assertPermission("orders.update");
    if (!(status in OrderStatus)) return failure("Unknown status.");
    const notifications = await updateOrderStatus(orderId, status as OrderStatus, user.id, note);
    if (notifications.length) after(() => flushNotifications(notifications));
    refresh(orderId);
    return success("Order status updated.");
  } catch (error) {
    return handleActionError(error);
  }
}

const trackingSchema = z.object({ carrier: z.string().trim().max(60).optional(), trackingNumber: z.string().trim().max(80).optional(), trackingUrl: z.string().trim().max(500).optional().refine((value) => !value || /^https?:\/\//.test(value), "Enter a full URL."), markShipped: z.string().optional() });

export async function saveTrackingAction(orderId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("orders.update");
    const parsed = trackingSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the tracking details.");
    await setShipmentTracking(orderId, { carrier: parsed.data.carrier ?? null, trackingNumber: parsed.data.trackingNumber ?? null, trackingUrl: parsed.data.trackingUrl ?? null }, user.id);
    const notifications: NotificationEvent[] = [];
    if (parsed.data.markShipped === "on") {
      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      // Only an order fulfilment has accepted (and so has been paid for) can ship.
      if (order.status !== OrderStatus.SHIPPED && ["ACCEPTED", "PROCESSING", "PACKED"].includes(order.status)) notifications.push(...(await updateOrderStatus(orderId, OrderStatus.SHIPPED, user.id)));
    }
    if (notifications.length) after(() => flushNotifications(notifications));
    refresh(orderId);
    return success("Tracking saved.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function addOrderNoteAction(orderId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("orders.update");
    await addOrderNote(orderId, String(formData.get("message") ?? ""), user.id, true);
    refresh(orderId);
    return success("Note added.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function markOrderPaidAction(orderId: string): Promise<ActionState> {
  try {
    const user = await assertPermission("orders.update");
    const notifications = await markPaidManually(orderId, user.id);
    if (notifications.length) after(() => flushNotifications(notifications));
    refresh(orderId);
    return success("Order marked as paid.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function refundOrderAction(orderId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("orders.refund");
    const amount = parseMoneyToCents(String(formData.get("amount") ?? ""));
    const reason = String(formData.get("reason") ?? "").trim() || "Refund issued by staff";
    if (amount === null) return failure("Enter a refund amount.", { amount: ["Enter a valid amount."] });
    const notifications = await refundOrder(orderId, amount, reason, user.id);
    if (notifications.length) after(() => flushNotifications(notifications));
    refresh(orderId);
    return success("Refund issued.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function cancelOrderAction(orderId: string, reason: string): Promise<ActionState> {
  try {
    const user = await assertPermission("orders.cancel");
    const notifications = await cancelOrder(orderId, reason.trim() || "Cancelled by staff", user.id);
    if (notifications.length) after(() => flushNotifications(notifications));
    refresh(orderId);
    return success("Order cancelled.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function resendOrderConfirmationAction(orderId: string): Promise<ActionState> {
  try {
    await assertPermission("orders.update");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const ids = await dispatchNotification({ type: "order.confirmed", orderId: order.id });
    await sendDeliveries(ids);
    await db.orderEvent.create({ data: { orderId, type: "EMAIL", message: `Confirmation email resent to ${order.email}`, isInternal: true } });
    refresh(orderId);
    return success(`Confirmation resent to ${order.email}.`);
  } catch (error) {
    return handleActionError(error);
  }
}
