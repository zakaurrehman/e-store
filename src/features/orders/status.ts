import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

/** Customer-facing fulfilment timeline, in order. */
export const FULFILMENT_STEPS: Array<{ status: OrderStatus; label: string; description: string }> = [
  { status: "PENDING", label: "Order placed", description: "We've received your order." },
  { status: "CONFIRMED", label: "Payment confirmed", description: "Your payment has been verified." },
  { status: "PROCESSING", label: "Processing", description: "We're picking your items." },
  { status: "PACKED", label: "Packed", description: "Your order is packed and ready for the courier." },
  { status: "SHIPPED", label: "Shipped", description: "Your parcel is on its way." },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery", description: "The courier is delivering today." },
  { status: "DELIVERED", label: "Delivered", description: "Your order has arrived." },
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
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

/** Allowed forward transitions for staff (cancellation is handled separately). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["PROCESSING", "PACKED", "SHIPPED"],
  PROCESSING: ["PACKED", "SHIPPED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const CANCELLABLE_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"];

export function stepIndex(status: OrderStatus) {
  return FULFILMENT_STEPS.findIndex((step) => step.status === status);
}

export function statusTone(status: OrderStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "CONFIRMED":
    case "PROCESSING":
    case "PACKED":
      return "info";
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
