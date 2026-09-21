import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, PageHeader, StatusBadge, Table, Td, Th, dateTime } from "@/components/admin/ui";
import { OrderFinanceTable } from "@/components/commerce/order-finance";
import { Alert, Skeleton } from "@/components/ui/misc";
import { storedOrderFinance } from "@/features/finance/order-finance";
import { FULFILMENT_STEPS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, stepIndex, statusTone } from "@/features/orders/status";
import { getStoreOrder } from "@/features/stores/dashboard";
import { fulfilmentShortfallCents } from "@/features/wallet/service";
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
  const current = order.status === "CANCELLED" ? -1 : stepIndex(order.status);
  const shipment = order.shipments[0];
  const shortfall = order.status === "AWAITING_FUNDS" ? await fulfilmentShortfallCents(order.id) : 0;

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
      {order.status === "AWAITING_FUNDS" && (
        <Alert tone="warning" title="Deposit required to fulfil this order" className="mb-6">
          <p>
            The fulfilment cost is {formatMoney(finance.fulfilmentCostCents, order.currency)} and your balance is {formatMoney(shortfall, order.currency)} short. Deposit the difference and the order goes to
            fulfilment as soon as Zendropship confirms it.
          </p>
          <p className="mt-2">
            <Link href="/dashboard/balance" className="font-medium underline underline-offset-4">
              Open your balance
            </Link>
          </p>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Fulfilment" description="Handled by Zendropship. You don't need to do anything to ship this order.">
            {order.status === "CANCELLED" ? (
              <p className="text-[0.9375rem] text-danger">This order was cancelled.</p>
            ) : (
              <ol className="grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
                {FULFILMENT_STEPS.map((step, index) => (
                  <li key={step.status} className="flex items-center gap-2 sm:flex-col sm:items-start">
                    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", index <= current ? "bg-success text-white" : "bg-canvas text-ink-400")}>
                      {index <= current ? <Check className="size-4" aria-hidden /> : index + 1}
                    </span>
                    <span className={cn("text-[0.875rem]", index <= current ? "font-medium text-ink-950" : "text-ink-500")}>{step.label}</span>
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
              Your earning is credited to your balance when the customer&rsquo;s payment is collected{order.paymentProvider === "cod" ? " — on delivery for cash on delivery." : "."}
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
