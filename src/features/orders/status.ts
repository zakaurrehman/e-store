import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

/**
 * The order's life, in order. `PENDING` is "waiting for the customer's online payment" and `CONFIRMED` is
 * "placed, waiting for the store owner to accept it" (cash on delivery is confirmed when placed, with
 * nothing collected). `ACCEPTED` is the owner's decision, never automatic: the wholesale cost is set aside
 * once and fulfilment starts processing. `AWAITING_FUNDS` is only found on orders from before acceptance was
 * the owner's call, and waits for them the same way.
 *
 * These are the fulfilment stages everyone follows — customer, owner and staff. Payment is not one of them:
 * whether the money has been collected lives on `paymentStatus`, the Payment records and the order's
 * history, and is shown as the payment status, never as a step of the journey. So an order waiting for its
 * owner is simply "Order placed", however it is being paid for.
 */
export const FULFILMENT_STEPS: Array<{ status: OrderStatus; label: string; description: string }> = [
  { status: "PENDING", label: "Order placed", description: "We've received your order." },
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
  CONFIRMED: "Order placed",
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
  AWAITING_FUNDS: "Order placed",
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

/**
 * Where on the fulfilment stages an order is (-1 once cancelled). Until the store owner accepts it, an order
 * is at "Order placed" — waiting for an online payment, placed with cash on delivery, or paid: none of those
 * is a fulfilment step. Waiting for funds is invisible to the customer the same way.
 */
export function stepIndex(status: OrderStatus) {
  const shown = status === "CONFIRMED" || status === "AWAITING_FUNDS" ? "PENDING" : status;
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
