import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

/**
 * The order's life, in order. `PENDING` is "waiting for the customer's payment" and `CONFIRMED` is
 * "the money is in"; `ACCEPTED` means Zendropship fulfilment has taken the order and charged the wholesale
 * cost to the owner's balance. `AWAITING_FUNDS` sits between the two when that charge cannot be covered yet.
 * Refunded and failed are payment states, kept on `paymentStatus` so an order has one status, not two.
 */
export const FULFILMENT_STEPS: Array<{ status: OrderStatus; label: string; description: string }> = [
  { status: "PENDING", label: "Order placed", description: "We've received your order." },
  { status: "CONFIRMED", label: "Payment confirmed", description: "Your payment has been verified." },
  { status: "ACCEPTED", label: "Accepted", description: "Your order is with our fulfilment team." },
  { status: "PROCESSING", label: "Processing", description: "We're picking your items." },
  { status: "PACKED", label: "Packed", description: "Your order is packed and ready for the courier." },
  { status: "SHIPPED", label: "Shipped", description: "Your parcel is on its way." },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery", description: "The courier is delivering today." },
  { status: "DELIVERED", label: "Delivered", description: "Your order has arrived." },
];

/** Staff and owner wording. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment",
  CONFIRMED: "Confirmed",
  AWAITING_FUNDS: "Awaiting funds",
  ACCEPTED: "Accepted",
  PROCESSING: "Processing",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** What the customer is told. Funding is between the store and Zendropship, so it is not their business. */
export const CUSTOMER_STATUS_LABELS: Record<OrderStatus, string> = {
  ...ORDER_STATUS_LABELS,
  AWAITING_FUNDS: "Confirmed",
  ACCEPTED: "Preparing your order",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  AUTHORIZED: "Authorised",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
  CANCELLED: "Cancelled",
};

/**
 * Allowed forward transitions for staff (cancellation is handled separately). Moving an order to ACCEPTED
 * goes through the funding check, which charges the wholesale cost to the owner's balance.
 */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["ACCEPTED"],
  AWAITING_FUNDS: ["ACCEPTED"],
  ACCEPTED: ["PROCESSING", "PACKED", "SHIPPED"],
  PROCESSING: ["PACKED", "SHIPPED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const CANCELLABLE_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "AWAITING_FUNDS", "ACCEPTED", "PROCESSING", "PACKED"];

/** Orders fulfilment is working on right now. */
export const OPEN_STATUSES: OrderStatus[] = ["CONFIRMED", "AWAITING_FUNDS", "ACCEPTED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"];

export function stepIndex(status: OrderStatus) {
  // Waiting for funds is invisible to the customer: their order is confirmed and being prepared.
  const shown = status === "AWAITING_FUNDS" ? "CONFIRMED" : status;
  return FULFILMENT_STEPS.findIndex((step) => step.status === shown);
}

export function statusTone(status: OrderStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "PENDING":
    case "AWAITING_FUNDS":
      return "warning";
    case "CONFIRMED":
    case "ACCEPTED":
    case "PROCESSING":
    case "PACKED":
    case "SHIPPED":
    case "OUT_FOR_DELIVERY":
      return "info";
    case "DELIVERED":
      return "success";
    case "CANCELLED":
      return "danger";
  }
}

export function paymentTone(status: PaymentStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "PAID":
      return "success";
    case "PENDING":
    case "PROCESSING":
    case "AUTHORIZED":
      return "warning";
    case "FAILED":
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}
