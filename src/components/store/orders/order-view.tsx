import { Check, Package, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import type { CustomerOrder } from "@/features/orders/queries";
import { FULFILMENT_STEPS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, statusTone, stepIndex } from "@/features/orders/status";
import { formatAddressLines } from "@/lib/address";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";
import { RetryPaymentButton } from "./retry-payment";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const PAYMENT_LABELS: Record<string, string> = { stripe: "Card (Stripe)", paypal: "PayPal", cod: "Cash on delivery", sandbox: "Test card (sandbox)" };

export function OrderTimeline({ order }: { order: Pick<CustomerOrder, "status" | "events" | "placedAt" | "deliveredAt"> }) {
  if (order.status === "CANCELLED") {
    return (
      <Alert tone="danger" title="This order was cancelled">
        {order.events.filter((event) => event.type === "STATUS_CHANGED").at(-1)?.message}
      </Alert>
    );
  }
  const current = stepIndex(order.status);
  return (
    <ol className="relative">
      {FULFILMENT_STEPS.map((step, index) => {
        const reached = index <= current;
        const active = index === current;
        const stamp = index === 0 ? order.placedAt : step.status === "DELIVERED" ? order.deliveredAt : order.events.find((event) => (event.data as { status?: string } | null)?.status === step.status)?.createdAt;
        return (
          <li key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
            {index < FULFILMENT_STEPS.length - 1 && <span className={cn("absolute left-[0.8125rem] top-7 h-[calc(100%-1rem)] w-px", reached && index < current ? "bg-ink-950" : "bg-line")} aria-hidden />}
            <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border", reached ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong bg-surface text-ink-300", active && "ring-4 ring-ink-950/10")}>
              {reached ? <Check className="size-3.5" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-[0.9375rem] font-medium", reached ? "text-ink-950" : "text-ink-400")}>{step.label}</p>
              <p className={cn("text-[0.8125rem]", reached ? "text-ink-600" : "text-ink-400")}>{step.description}</p>
              {reached && stamp && <p className="mt-0.5 text-[0.75rem] text-ink-400">{dateFormat.format(stamp)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderView({ order, accessToken, paymentNotice }: { order: CustomerOrder; accessToken?: string; paymentNotice?: "cancelled" | "failed" | null }) {
  const unpaid = order.paymentStatus !== "PAID" && order.status !== "CANCELLED" && order.paymentProvider !== "cod";
  const shipment = order.shipments[0];
  const eta = order.shippingMethod && order.status !== "DELIVERED" && order.status !== "CANCELLED" ? `${dayFormat.format(new Date(order.placedAt.getTime() + order.shippingMethod.minDays * 86_400_000))} – ${dayFormat.format(new Date(order.placedAt.getTime() + order.shippingMethod.maxDays * 86_400_000))}` : null;

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="space-y-8 lg:col-span-8">
        {unpaid && (
          <Alert tone={paymentNotice ? "warning" : "info"} title={paymentNotice === "failed" ? "Your payment didn't go through" : paymentNotice === "cancelled" ? "Payment was cancelled" : order.paymentStatus === "PROCESSING" ? "Payment is being confirmed" : "Payment required"}>
            <p>
              {order.paymentStatus === "PROCESSING" && !paymentNotice
                ? "We're waiting for your payment provider to confirm. This page updates automatically once it's done — usually within a minute."
                : "No money has been taken. Your items are held for 2 hours — complete payment to confirm your order."}
            </p>
            {order.paymentStatus !== "PROCESSING" || paymentNotice ? (
              <div className="mt-3">
                <RetryPaymentButton orderNumber={order.number} token={accessToken} />
              </div>
            ) : null}
          </Alert>
        )}
        {order.paymentStatus === "PROCESSING" && !paymentNotice && <meta httpEquiv="refresh" content="20" />}

        <section className="rounded-lg border border-line p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Tracking</h2>
              {eta && <p className="mt-1 text-[0.9375rem] text-ink-600">Estimated delivery {eta}</p>}
            </div>
            <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
          </div>
          <div className="mt-6">
            <OrderTimeline order={order} />
          </div>
          {shipment?.trackingNumber && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-md bg-canvas px-4 py-3 text-sm">
              <Truck className="size-4 text-ink-700" aria-hidden />
              <span className="text-ink-700">
                {shipment.carrier ? `${shipment.carrier} · ` : ""}
                <span className="tabular font-medium text-ink-950">{shipment.trackingNumber}</span>
              </span>
              {shipment.trackingUrl && (
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="ml-auto font-medium text-ink-950 underline underline-offset-4">
                  Track with carrier
                </a>
              )}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-line p-6">
          <h2 className="text-lg font-semibold">Items</h2>
          <ul className="mt-4 divide-y divide-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-canvas">
                  {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="80px" className="object-cover" /> : <Package className="absolute inset-0 m-auto size-6 text-ink-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${item.productSlug}`} className="text-[0.9375rem] font-medium text-ink-950 hover:underline">
                    {item.productName}
                  </Link>
                  {item.variantTitle && <p className="text-[0.8125rem] text-ink-500">{item.variantTitle}</p>}
                  <p className="tabular mt-1 text-[0.8125rem] text-ink-500">
                    {formatMoney(item.unitPriceCents, order.currency)} × {item.quantity}
                  </p>
                </div>
                <p className="tabular text-[0.9375rem] font-medium">{formatMoney(item.totalCents, order.currency)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="space-y-6 lg:col-span-4">
        <section className="rounded-lg border border-line p-6">
          <h2 className="text-lg font-semibold">Summary</h2>
          <dl className="tabular mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-600">Subtotal</dt>
              <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
            </div>
            {order.discountCents > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                <dd>−{formatMoney(order.discountCents, order.currency)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-600">Shipping · {order.shippingMethodName}</dt>
              <dd>{order.shippingCents === 0 ? "Free" : formatMoney(order.shippingCents, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Tax</dt>
              <dd>{formatMoney(order.taxCents, order.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatMoney(order.totalCents, order.currency)}</dd>
            </div>
            {order.refundedCents > 0 && (
              <div className="flex justify-between text-ink-600">
                <dt>Refunded</dt>
                <dd>−{formatMoney(order.refundedCents, order.currency)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
            <span className="text-ink-600">{PAYMENT_LABELS[order.paymentProvider] ?? order.paymentProvider}</span>
            <Badge tone={paymentTone(order.paymentStatus)}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
          </div>
        </section>
        <section className="rounded-lg border border-line p-6 text-[0.9375rem]">
          <h2 className="text-lg font-semibold">Delivery address</h2>
          {order.shippingAddress && (
            <address className="mt-3 not-italic leading-relaxed text-ink-700">
              {formatAddressLines(order.shippingAddress).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          )}
          <p className="mt-4 text-[0.8125rem] text-ink-500">Confirmation sent to {order.email}</p>
          {order.customerNote && (
            <p className="mt-3 rounded-sm bg-canvas px-3 py-2 text-[0.8125rem] text-ink-600">
              <span className="font-medium text-ink-800">Your note:</span> {order.customerNote}
            </p>
          )}
        </section>
        <p className="text-[0.8125rem] text-ink-500">
          Need help with this order?{" "}
          <Link href={`/contact?order=${order.number}`} className="underline underline-offset-4">
            Contact us
          </Link>
        </p>
      </aside>
    </div>
  );
}
