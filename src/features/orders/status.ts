import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

/**
 * The order's life, in order. `PENDING` is "waiting for the customer's payment" and `CONFIRMED` is
 * "confirmed, waiting for the store owner to accept it" (cash on delivery is confirmed when placed).
 * `ACCEPTED` is the owner's decision, never automatic: the wholesale cost is set aside once and fulfilment
 * starts processing. `AWAITING_FUNDS` is only found on orders from before acceptance was the owner's call,
 * and waits for them the same way. Refunded and failed are payment states, kept on `paymentStatus`.
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
 * The forward transitions (cancellation is handled separately). The step to ACCEPTED is taken only by
 * `acceptOrder` — by the store owner, with the funding check — and never by a plain status change.
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

/** Waiting for the store owner to accept. `AWAITING_FUNDS` is only found on orders from before acceptance was the owner's call. */
export const WAITING_FOR_ACCEPTANCE: OrderStatus[] = ["CONFIRMED", "AWAITING_FUNDS"];

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
