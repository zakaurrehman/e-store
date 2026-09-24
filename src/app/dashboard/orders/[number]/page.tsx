import { Check } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, PageHeader, StatusBadge, Table, Td, Th, dateTime } from "@/components/admin/ui";
import { OrderFinanceTable } from "@/components/commerce/order-finance";
import { AcceptOrder } from "@/components/dashboard/accept-order";
import { Alert, Skeleton } from "@/components/ui/misc";
import { storedOrderFinance } from "@/features/finance/order-finance";
import { fulfilmentProgress, isFulfilmentComplete } from "@/features/orders/progress";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, WAITING_FOR_ACCEPTANCE, paymentTone, statusTone } from "@/features/orders/status";
import { getStoreOrder } from "@/features/stores/dashboard";
import { balanceNeededCents, getAvailableCents } from "@/features/wallet/service";
import { requireStoreOwner } from "@/features/stores/guards";
import { isAddressSnapshot } from "@/lib/address";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Order" };

async function OrderDetail({ params }: PageProps<"/dashboard/orders/[number]">) {
  const [{ store }, { number }] = await Promise.all([requireStoreOwner("/dashboard/orders"), params]);
  const order = await getStoreOrder(store.id, number);
  if (!order) notFound();
  const address = isAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null;
  const finance = storedOrderFinance(order);
  const stages = fulfilmentProgress({ status: order.status, placedAt: order.placedAt, deliveredAt: order.deliveredAt, events: order.events });
  const shipment = order.shipments[0];
  // Waiting for this owner to accept it: what that would take from their available balance, and what they have.
  const waiting = WAITING_FOR_ACCEPTANCE.includes(order.status);
  const neededCents = waiting ? balanceNeededCents(order) : 0;
  const availableCents = waiting ? await getAvailableCents(store.id) : 0;
  const shortCents = Math.max(0, neededCents - Math.max(0, availableCents));
  const money = (cents: number) => formatMoney(cents, order.currency);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Orders", href: "/dashboard/orders" }, { label: order.number }]}
        title={`Order ${order.number}`}
        description={`Placed ${dateTime.format(order.placedAt)}`}
        actions={
          <>
            <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={statusTone(order.status)} />
            <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
          </>
        }
      />
      {waiting &&
        (shortCents > 0 ? (
          <Alert tone="warning" title="Insufficient wallet balance to accept this order. Please add funds." className="mb-6">
            <p>
              Accepting this order needs {money(neededCents)} from your available balance, and you have {money(availableCents)}. Add {money(shortCents)}, and once Zendropship confirms it, come back and accept the order.
              It waits for you until then.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <AcceptOrder order={{ id: order.id, number: order.number, currency: order.currency, fulfilmentCostCents: finance.fulfilmentCostCents }} neededCents={neededCents} availableCents={availableCents} />
            </div>
          </Alert>
        ) : (
          <Alert tone="info" title="This order is waiting for you to accept it" className="mb-6">
            <p>
              Nothing is fulfilled until you accept it. Accepting sets the {money(finance.fulfilmentCostCents)} wholesale cost aside once —{" "}
              {neededCents > 0 ? `${money(neededCents)} from your available balance` : "out of the customer's payment, so nothing is taken from your balance"} — and Zendropship starts processing it. What you earn stays
              held until it is delivered.
            </p>
            <div className="mt-3">
              <AcceptOrder order={{ id: order.id, number: order.number, currency: order.currency, fulfilmentCostCents: finance.fulfilmentCostCents }} neededCents={neededCents} availableCents={availableCents} />
            </div>
          </Alert>
        ))}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Fulfilment"
            description={isFulfilmentComplete(order.status) ? "Delivered — this order is complete." : waiting ? "Zendropship fulfils it once you accept it." : "Handled by Zendropship. You don't need to do anything to ship this order."}
          >
            {order.status === "CANCELLED" ? (
              <p className="text-[0.9375rem] text-danger">This order was cancelled.</p>
            ) : (
              <ol className="grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
                {stages.map((stage, index) => (
                  <li key={stage.status} className="flex items-center gap-2 sm:flex-col sm:items-start">
                    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", stage.done ? "bg-success text-white" : "bg-canvas text-ink-400")}>
                      {stage.done ? <Check className="size-4" aria-hidden /> : index + 1}
                    </span>
                    <span className={cn("text-[0.875rem]", stage.done ? "font-medium text-ink-950" : "text-ink-500")}>{stage.label}</span>
                    {stage.at && <span className="text-[0.75rem] text-ink-500">{dateTime.format(stage.at)}</span>}
                  </li>
                ))}
              </ol>
            )}
            {shipment && (
              <p className="mt-5 border-t border-line pt-4 text-[0.9375rem] text-ink-700">
                Shipped with {shipment.carrier ?? "our courier"}
                {shipment.trackingNumber && (
                  <>
                    {" · tracking "}
                    {shipment.trackingUrl ? (
                      <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                        {shipment.trackingNumber}
                      </a>
                    ) : (
                      <span className="font-medium">{shipment.trackingNumber}</span>
                    )}
                  </>
                )}
              </p>
            )}
          </Card>

          <Card title="Items" padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Price</Th>
                  <Th className="text-right">You pay</Th>
                  <Th className="text-right">Margin</Th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <p className="font-medium text-ink-950">{item.productName}</p>
                      {item.variantTitle && <p className="text-[0.8125rem] text-ink-500">{item.variantTitle}</p>}
                    </Td>
                    <Td className="tabular text-right">{item.quantity}</Td>
                    <Td className="tabular text-right">{formatMoney(item.unitPriceCents, order.currency)}</Td>
                    <Td className="tabular text-right">{formatMoney(item.unitCostCents, order.currency)}</Td>
                    <Td className="tabular text-right text-success">{formatMoney((item.unitPriceCents - item.unitCostCents) * item.quantity, order.currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="border-t border-line px-5 py-3 text-[0.8125rem] text-ink-500">Margin is the price less what you pay, before Zendropship&rsquo;s commission. What you actually earn is under Money.</p>
          </Card>

          {order.events.length > 0 && (
            <Card title="Timeline">
              <ol className="space-y-3">
                {order.events.map((event) => (
                  <li key={event.id} className="flex gap-3 text-[0.9375rem]">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                    <div>
                      <p className="text-ink-950">{event.message}</p>
                      <p className="text-[0.8125rem] text-ink-500">{dateTime.format(event.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Money" description="Worked out when the order was placed — later rate changes never alter it.">
            <OrderFinanceTable finance={finance} currency={order.currency} audience="owner" />
            <p className="mt-3 text-[0.8125rem] text-ink-500">
              What you earn is held until the order is delivered, and becomes yours to withdraw then.
            </p>
          </Card>
          <Card title="Customer">
            <p className="text-[0.9375rem] text-ink-950">{address ? `${address.firstName} ${address.lastName}` : "—"}</p>
            <p className="text-[0.9375rem] text-ink-600">{order.email}</p>
            {address && (
              <address className="mt-3 text-[0.9375rem] not-italic leading-relaxed text-ink-600">
                {address.line1}
                {address.line2 && <>, {address.line2}</>}
                <br />
                {address.city}
                {address.region && `, ${address.region}`} {address.postalCode}
                <br />
                {address.country}
              </address>
            )}
            {order.shippingMethodName && <p className="mt-3 text-[0.8125rem] text-ink-500">Delivery: {order.shippingMethodName}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function DashboardOrderPage(props: PageProps<"/dashboard/orders/[number]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OrderDetail {...props} />
    </Suspense>
  );
}
