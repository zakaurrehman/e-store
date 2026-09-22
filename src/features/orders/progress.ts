/**
 * The fulfilment timeline of one order: which stages it has been through, when, and who moved it.
 * Client-safe (pure). Built from the order's own event log, so the admin, the owner and the customer
 * are all reading the same history rather than three different guesses.
 */
import type { OrderStatus } from "@/generated/prisma/enums";
import { FULFILMENT_STEPS, ORDER_STATUS_LABELS, stepIndex } from "./status";

export type ProgressEvent = {
  type: string;
  message: string;
  data: unknown;
  createdAt: Date;
  actor?: { firstName: string; lastName: string } | null;
};

export type FulfilmentStage = {
  status: OrderStatus;
  label: string;
  description: string;
  /** When the order reached this stage (null when it has not, or for old orders with no event). */
  at: Date | null;
  /** Who moved it — a staff name, or null for the system (payment webhooks, automatic acceptance). */
  by: string | null;
  done: boolean;
  current: boolean;
};

const statusOf = (event: ProgressEvent) => (event.data as { status?: string } | null)?.status;

/**
 * Every stage of the journey with its timestamp. `PENDING` is the moment the order was placed; the rest
 * come from the status-change events. Cancelled orders stop where they were cancelled.
 */
export function fulfilmentProgress(order: { status: OrderStatus; placedAt: Date; deliveredAt?: Date | null; events: ProgressEvent[] }): FulfilmentStage[] {
  const reached = order.status === "CANCELLED" ? -1 : stepIndex(order.status);
  const changes = order.events.filter((event) => event.type === "STATUS_CHANGED");
  return FULFILMENT_STEPS.map((step, index) => {
    const event = changes.find((change) => statusOf(change) === step.status);
    const at = step.status === "PENDING" ? order.placedAt : (event?.createdAt ?? (step.status === "DELIVERED" ? (order.deliveredAt ?? null) : null));
    const done = index <= reached;
    return {
      status: step.status,
      label: step.label,
      description: step.description,
      at: done ? at : null,
      by: event?.actor ? `${event.actor.firstName} ${event.actor.lastName}` : null,
      done,
      current: index === reached,
    };
  });
}

/** True once the order has been delivered: fulfilment is finished and nothing else is expected. */
export const isFulfilmentComplete = (status: OrderStatus) => status === "DELIVERED";

export type NextStep = {
  status: OrderStatus;
  /** What the button says on the order page. */
  label: string;
  /** The same step in the narrow list column. */
  short: string;
  /** What the confirmation dialog explains, when one is worth showing. */
  confirm?: string;
};

/**
 * The single next step staff normally take. Other valid jumps (accepted straight to shipped, say) stay
 * available in the full status dialog; this is the one-click path down the happy road.
 */
export function nextFulfilmentStep(status: OrderStatus): NextStep | null {
  switch (status) {
    case "CONFIRMED":
    case "AWAITING_FUNDS":
      return {
        status: "ACCEPTED",
        label: "Accept for fulfilment",
        short: "Accept",
        confirm:
          "The wholesale cost is charged to the store owner's balance once, and the customer's payment for this order is counted first — so a normally priced order needs no deposit. If the balance still cannot cover it, the order waits for funds instead.",
      };
    case "ACCEPTED":
      return { status: "PROCESSING", label: "Start processing", short: "Processing" };
    case "PROCESSING":
      return { status: "PACKED", label: "Mark packed", short: "Packed" };
    case "PACKED":
      return { status: "SHIPPED", label: "Mark shipped", short: "Shipped", confirm: "The customer is emailed that their parcel is on its way. Add the carrier and tracking number first if you have them." };
    case "SHIPPED":
      return { status: "OUT_FOR_DELIVERY", label: "Out for delivery", short: "Out for delivery" };
    case "OUT_FOR_DELIVERY":
      return { status: "DELIVERED", label: "Mark delivered", short: "Delivered", confirm: "This completes fulfilment: the customer is emailed, and cash-on-delivery money becomes the owner's to withdraw. It cannot be undone." };
    default:
      return null;
  }
}

/** Short line for the list: what is expected of staff next, or why nothing is. */
export function fulfilmentHint(status: OrderStatus): string {
  switch (status) {
    case "PENDING":
      return "Waiting for the customer's payment";
    case "AWAITING_FUNDS":
      return "Waiting for the store owner to deposit the shortfall";
    case "DELIVERED":
      return "Fulfilment complete";
    case "CANCELLED":
      return "Cancelled — fulfilment stopped";
    default:
      return `Next: ${ORDER_STATUS_LABELS[nextFulfilmentStep(status)?.status ?? status]}`;
  }
}
