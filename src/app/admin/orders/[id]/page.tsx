import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FulfilmentTracker } from "@/components/admin/orders/fulfilment-tracker";
import { OrderActions, OrderNoteForm } from "@/components/admin/orders/order-actions";
import { Card, dateTime, DescriptionList, PageHeader, StatusBadge, Table, Td, Th } from "@/components/admin/ui";
import { OrderFinanceTable } from "@/components/commerce/order-finance";
import { StoreMark } from "@/components/store/header/store-brand";
import { Alert, Skeleton } from "@/components/ui/misc";
import { getAdminOrder } from "@/features/admin/orders/queries";
import { storedOrderFinance } from "@/features/finance/order-finance";
import { fulfilmentProgress, isFulfilmentComplete } from "@/features/orders/progress";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, statusTone } from "@/features/orders/status";
import { WALLET_ENTRY_LABELS } from "@/features/wallet/queries";
import { fulfilmentShortfallCents } from "@/features/wallet/service";
import { formatAddressLines, isAddressSnapshot } from "@/lib/address";
import { can, requirePagePermission } from "@/server/auth/guards";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Order" };

const EVENT_TONES: Record<string, string> = { PAYMENT: "bg-success", REFUND: "bg-warning", NOTE: "bg-ink-400", STATUS_CHANGED: "bg-ink-950", SHIPMENT: "bg-info", EMAIL: "bg-iris-500", SYSTEM: "bg-danger", CREATED: "bg-ink-950" };

async function OrderDetail({ params }: PageProps<"/admin/orders/[id]">) {
  const [{ id }, user] = await Promise.all([params, requirePagePermission("orders.view", "/admin/orders")]);
  const order = await getAdminOrder(id);
  if (!order) notFound();
  const shipping = isAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null;
  const billing = isAddressSnapshot(order.billingAddress) ? order.billingAddress : null;
  const paid = order.payments.find((payment) => payment.status === "PAID" || payment.status === "PARTIALLY_REFUNDED");
  const refundable = paid ? paid.capturedCents - paid.refundedCents : 0;
  const shipment = order.shipments[0] ?? null;
  const finance = storedOrderFinance(order);
  // What accepting this order would still need from the owner's balance — 0 when its own payment covers it.
  const needsFunding = order.status === "AWAITING_FUNDS" || order.status === "CONFIRMED";
  const shortfall = needsFunding ? await fulfilmentShortfallCents(order.id) : 0;
  const stages = fulfilmentProgress({ status: order.status, placedAt: order.placedAt, deliveredAt: order.deliveredAt, events: order.events });
  const cancellation = order.status === "CANCELLED" ? order.events.find((event) => (event.data as { status?: string } | null)?.status === "CANCELLED") : null;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Orders", href: "/admin/orders" }, { label: order.number }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{order.number}</span>
            <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={statusTone(order.status)} />
            <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
          </span>
        }
        description={`Placed ${dateTime.format(order.placedAt)} · ${order.paymentProvider}`}
      />
      {order.status === "AWAITING_FUNDS" && (
        <Alert tone="warning" title="Waiting for funds" className="mb-6">
          {order.store.name} needs {formatMoney(shortfall, order.currency)} more in its balance before the {formatMoney(finance.fulfilmentCostCents, order.currency)} fulfilment cost can be charged. The order is
          accepted automatically as soon as a deposit is confirmed.
        </Alert>
      )}
      {order.status === "CONFIRMED" && shortfall === 0 && (
        <Alert tone="success" title="Ready for fulfilment" className="mb-6">
          This order&rsquo;s own payment covers the {formatMoney(finance.fulfilmentCostCents, order.currency)} fulfilment cost, so no deposit is needed. Accept it to charge the cost once and start fulfilment.
        </Alert>
      )}
      {isFulfilmentComplete(order.status) && (
        <Alert tone="success" title="Fulfilment complete" className="mb-6">
          Delivered {order.deliveredAt ? dateTime.format(order.deliveredAt) : ""}. There is nothing further to do on this order.
        </Alert>
      )}
      <div className="mb-6">
        <OrderActions
          order={{ id: order.id, number: order.number, status: order.status, paymentStatus: order.paymentStatus, paymentProvider: order.paymentProvider, currency: order.currency, totalCents: order.totalCents, refundableCents: refundable }}
          tracking={shipment ? { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl } : null}
          can={{ update: can(user, "orders.update"), refund: can(user, "orders.refund"), cancel: can(user, "orders.cancel") }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <Card title="Fulfilment" description="Every stage, when it happened and who moved it.">
            <FulfilmentTracker stages={stages} cancelled={cancellation ? { at: cancellation.createdAt, by: cancellation.actor ? `${cancellation.actor.firstName} ${cancellation.actor.lastName}` : null, reason: cancellation.message } : null} />
          </Card>

          <Card title="Items" padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th className="text-right">Price</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-canvas">{item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" />}</div>
                        <div className="min-w-0">
                          {item.productId ? (
                            <Link href={`/admin/products/${item.productId}`} className="font-medium text-ink-950 hover:underline">
                              {item.productName}
                            </Link>
                          ) : (
                            <span className="font-medium">{item.productName}</span>
                          )}
                          {item.variantTitle && <span className="block text-[0.75rem] text-ink-500">{item.variantTitle}</span>}
                        </div>
                      </div>
                    </Td>
                    <Td className="tabular text-ink-600">{item.sku ?? "—"}</Td>
                    <Td className="tabular text-right">{formatMoney(item.unitPriceCents, order.currency)}</Td>
                    <Td className="tabular text-right">{item.quantity}</Td>
                    <Td className="tabular text-right font-medium">{formatMoney(item.totalCents, order.currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <dl className="tabular ml-auto max-w-xs space-y-1.5 px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between text-success">
                  <dt>Discount {order.couponCode && `(${order.couponCode})`}</dt>
                  <dd>−{formatMoney(order.discountCents, order.currency)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-500">Shipping · {order.shippingMethodName}</dt>
                <dd>{formatMoney(order.shippingCents, order.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Tax</dt>
                <dd>{formatMoney(order.taxCents, order.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatMoney(order.totalCents, order.currency)}</dd>
              </div>
              {order.refundedCents > 0 && (
                <div className="flex justify-between text-warning">
                  <dt>Refunded</dt>
                  <dd>−{formatMoney(order.refundedCents, order.currency)}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card title="Payments" padded={false}>
            {order.payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">No payment attempts yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {payment.provider} · {formatMoney(payment.amountCents, payment.currency)}
                      </span>
                      <StatusBadge label={PAYMENT_STATUS_LABELS[payment.status]} tone={paymentTone(payment.status)} />
                    </div>
                    <p className="mt-1 text-[0.75rem] text-ink-500">
                      Ref {payment.providerReference ?? "—"} · {dateTime.format(payment.createdAt)}
                      {payment.failureReason && ` · ${payment.failureReason}`}
                    </p>
                    {payment.transactions.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[0.8125rem] text-ink-600">
                        {payment.transactions.map((transaction) => (
                          <li key={transaction.id} className="flex flex-wrap gap-x-3">
                            <span className="w-20 font-medium text-ink-800">{transaction.type}</span>
                            <span>{transaction.status}</span>
                            <span className="tabular">{formatMoney(transaction.amountCents, payment.currency)}</span>
                            {transaction.providerTransactionId && <span className="tabular text-ink-400">{transaction.providerTransactionId}</span>}
                            {transaction.reason && <span className="text-ink-500">{transaction.reason}</span>}
                            <span className="ml-auto text-ink-400">{dateTime.format(transaction.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Activity">
            {can(user, "orders.update") && (
              <div className="mb-6">
                <OrderNoteForm orderId={order.id} />
              </div>
            )}
            <ol className="relative space-y-4 border-l border-line pl-5">
              {order.events.map((event) => (
                <li key={event.id} className="relative text-sm">
                  <span className={cn("absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full ring-4 ring-surface", EVENT_TONES[event.type] ?? "bg-ink-400")} aria-hidden />
                  <p className={cn("text-ink-900", event.type === "NOTE" && "whitespace-pre-line rounded-sm bg-canvas px-3 py-2")}>{event.message}</p>
                  <p className="mt-0.5 text-[0.75rem] text-ink-500">
                    {dateTime.format(event.createdAt)}
                    {event.actor ? ` · ${event.actor.firstName} ${event.actor.lastName}` : " · System"}
                    {event.isInternal && " · internal"}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <Card title="Store & money" description="The figures stored on this order — the same ones the owner sees.">
            <div className="flex items-center gap-3">
              <StoreMark store={order.store} size={40} />
              <div className="min-w-0">
                <Link href={`/admin/stores?q=${order.store.slug}`} className="block truncate font-medium text-ink-950 hover:underline">
                  {order.store.name}
                </Link>
                <p className="truncate text-[0.8125rem] text-ink-500">{order.store.owner ? `${order.store.owner.firstName} ${order.store.owner.lastName} · ${order.store.owner.email}` : "Zendropship's own store"}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <OrderFinanceTable finance={finance} currency={order.currency} audience="staff" />
            </div>
            {order.walletEntries.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">Wallet movements</p>
                <ul className="mt-2 space-y-1 text-[0.8125rem]">
                  {order.walletEntries.map((entry) => (
                    <li key={entry.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-ink-700">
                        {WALLET_ENTRY_LABELS[entry.type]}
                        {entry.status === "PENDING" && <span className="ml-1.5 text-warning">pending</span>}
                      </span>
                      <span className={cn("tabular", entry.amountCents >= 0 ? "text-success" : "text-ink-800")}>
                        {entry.amountCents >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(entry.amountCents), order.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card title="Customer">
            {order.user ? (
              <div className="text-sm">
                <Link href={`/admin/customers/${order.user.id}`} className="font-medium text-ink-950 hover:underline">
                  {order.user.firstName} {order.user.lastName}
                </Link>
                <p className="text-ink-600">{order.user.email}</p>
                <p className="mt-1 text-[0.75rem] text-ink-500">
                  Customer since {dateTime.format(order.user.createdAt)} · {order.user._count.orders} order{order.user._count.orders === 1 ? "" : "s"}
                </p>
              </div>
            ) : (
              <div className="text-sm">
                <p className="font-medium">Guest</p>
                <p className="text-ink-600">{order.email}</p>
              </div>
            )}
            {order.phone && <p className="mt-2 text-sm text-ink-600">{order.phone}</p>}
            {order.customerNote && (
              <div className="mt-4 rounded-sm bg-canvas px-3 py-2 text-sm">
                <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">Customer note</p>
                <p className="mt-1 text-ink-800">{order.customerNote}</p>
              </div>
            )}
          </Card>
          <Card title="Shipping">
            {shipping && (
              <address className="text-sm not-italic leading-relaxed text-ink-800">
                {formatAddressLines(shipping).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            )}
            <DescriptionList
              className="mt-4"
              items={[
                { label: "Method", value: order.shippingMethodName },
                { label: "Carrier", value: shipment?.carrier ?? "—" },
                { label: "Tracking", value: shipment?.trackingNumber ? (shipment.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{shipment.trackingNumber}</a> : shipment.trackingNumber) : "—" },
                { label: "Shipped", value: shipment?.shippedAt ? dateTime.format(shipment.shippedAt) : "—" },
                { label: "Delivered", value: order.deliveredAt ? dateTime.format(order.deliveredAt) : "—" },
              ]}
            />
          </Card>
          <Card title="Billing">
            {billing && (
              <address className="text-sm not-italic leading-relaxed text-ink-800">
                {formatAddressLines(billing).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            )}
            {order.couponRedemption && <p className="mt-4 text-[0.8125rem] text-ink-600">Coupon {order.couponRedemption.coupon.code} saved {formatMoney(order.couponRedemption.discountCents, order.currency)}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OrderDetail {...props} />
    </Suspense>
  );
}
