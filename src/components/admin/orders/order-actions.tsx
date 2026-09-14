"use client";

import { useState } from "react";
import { ActionButton, ActionForm } from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { addOrderNoteAction, cancelOrderAction, markOrderPaidAction, refundOrderAction, resendOrderConfirmationAction, saveTrackingAction, setOrderStatusAction } from "@/features/admin/orders/actions";
import type { OrderStatus } from "@/generated/prisma/enums";
import { NEXT_STATUSES, ORDER_STATUS_LABELS } from "@/features/orders/status";
import { formatMoney } from "@/utils/money";

type Props = {
  order: { id: string; number: string; status: OrderStatus; paymentStatus: string; paymentProvider: string; currency: string; totalCents: number; refundableCents: number };
  tracking: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null } | null;
  can: { update: boolean; refund: boolean; cancel: boolean };
};

export function OrderActions({ order, tracking, can }: Props) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [statusNote, setStatusNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const nextOptions = NEXT_STATUSES[order.status];
  const cancellable = ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"].includes(order.status);

  return (
    <div className="flex flex-wrap gap-2">
      {can.update && nextOptions.length > 0 && (
        <Button size="sm" onClick={() => setStatusOpen(true)}>
          Update status
        </Button>
      )}
      {can.update && order.status !== "CANCELLED" && (
        <Button size="sm" variant="secondary" onClick={() => setTrackingOpen(true)}>
          {tracking?.trackingNumber ? "Edit tracking" : "Add tracking"}
        </Button>
      )}
      {can.update && order.paymentStatus !== "PAID" && order.status !== "CANCELLED" && (
        <ActionButton action={() => markOrderPaidAction(order.id)} confirm={{ title: "Mark this order as paid?", description: "Use this only when payment was received outside the store (e.g. cash on delivery or bank transfer).", confirmLabel: "Mark as paid" }}>
          Mark as paid
        </ActionButton>
      )}
      {can.refund && order.refundableCents > 0 && (
        <Button size="sm" variant="secondary" onClick={() => setRefundOpen(true)}>
          Refund
        </Button>
      )}
      {can.update && (
        <ActionButton action={() => resendOrderConfirmationAction(order.id)} confirm={{ title: "Resend the confirmation email?", confirmLabel: "Resend" }}>
          Resend confirmation
        </ActionButton>
      )}
      <a href={`/admin/orders/${order.id}/invoice`} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3.5 text-sm font-medium hover:border-ink-950">
        Print invoice
      </a>
      <a href={`/admin/orders/${order.id}/invoice?format=pdf`} className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3.5 text-sm font-medium hover:border-ink-950">
        Download PDF
      </a>
      {can.cancel && cancellable && (
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setCancelOpen(true)}>
          Cancel order
        </Button>
      )}

      <Dialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Update order status"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <ActionButton variant="primary" size="md" disabled={!nextStatus} action={() => setOrderStatusAction(order.id, nextStatus, statusNote)} onSuccess={() => setStatusOpen(false)}>
              Update
            </ActionButton>
          </div>
        }
      >
        <Field label="New status" htmlFor="next-status">
          <Select id="next-status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value as OrderStatus)}>
            <option value="">Choose…</option>
            {nextOptions.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="status-note" optional className="mt-4">
          <Input id="status-note" value={statusNote} onChange={(event) => setStatusNote(event.target.value)} maxLength={200} />
        </Field>
        <p className="mt-3 text-[0.8125rem] text-ink-500">Customers are emailed when an order is shipped or delivered.</p>
      </Dialog>

      <Dialog open={trackingOpen} onClose={() => setTrackingOpen(false)} title="Shipment tracking">
        <ActionForm action={saveTrackingAction.bind(null, order.id)} submitLabel="Save tracking" onSuccess={() => setTrackingOpen(false)}>
          <div className="space-y-4">
            <Field label="Carrier" htmlFor="carrier" optional>
              <Input id="carrier" name="carrier" defaultValue={tracking?.carrier ?? ""} placeholder="UPS, DHL, USPS…" />
            </Field>
            <Field label="Tracking number" htmlFor="trackingNumber">
              <Input id="trackingNumber" name="trackingNumber" defaultValue={tracking?.trackingNumber ?? ""} />
            </Field>
            <Field label="Tracking URL" htmlFor="trackingUrl" optional>
              <Input id="trackingUrl" name="trackingUrl" type="url" defaultValue={tracking?.trackingUrl ?? ""} placeholder="https://" />
            </Field>
            {["CONFIRMED", "PROCESSING", "PACKED"].includes(order.status) && <Checkbox id="markShipped" name="markShipped" defaultChecked label="Mark the order as shipped and email the customer" />}
          </div>
        </ActionForm>
      </Dialog>

      <Dialog open={refundOpen} onClose={() => setRefundOpen(false)} title="Issue a refund" description={`Up to ${formatMoney(order.refundableCents, order.currency)} can be refunded to the original payment method.`}>
        <ActionForm action={refundOrderAction.bind(null, order.id)} submitLabel="Refund" onSuccess={() => setRefundOpen(false)}>
          <div className="space-y-4">
            <Field label="Amount" htmlFor="refund-amount">
              <Input id="refund-amount" name="amount" inputMode="decimal" defaultValue={(order.refundableCents / 100).toFixed(2)} />
            </Field>
            <Field label="Reason" htmlFor="refund-reason">
              <Textarea id="refund-reason" name="reason" rows={3} placeholder="Shared with the customer in the refund email" />
            </Field>
          </div>
        </ActionForm>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel order ${order.number}?`}
        description={order.paymentStatus === "PAID" ? "Stock will be returned and the full payment refunded." : "Stock will be returned to inventory."}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <ActionButton variant="danger" size="md" action={() => cancelOrderAction(order.id, cancelReason)} onSuccess={() => setCancelOpen(false)}>
              Cancel order
            </ActionButton>
          </div>
        }
      >
        <Field label="Reason" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Shared with the customer" />
        </Field>
      </Dialog>
    </div>
  );
}

export function OrderNoteForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={addOrderNoteAction.bind(null, orderId)} submitLabel="Add note">
      <Textarea name="message" rows={3} placeholder="Internal note — not visible to the customer" required />
    </ActionForm>
  );
}
