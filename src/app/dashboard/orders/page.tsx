import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPagination, Card, FilterLink, PageHeader, StatusBadge, Table, TableEmpty, Td, Th, buildQuery, dateTime } from "@/components/admin/ui";
import { Alert, Skeleton } from "@/components/ui/misc";
import { AcceptOrder } from "@/components/dashboard/accept-order";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, WAITING_FOR_ACCEPTANCE, paymentTone, statusTone } from "@/features/orders/status";
import { listStoreOrders } from "@/features/stores/dashboard";
import { requireStoreOwner } from "@/features/stores/guards";
import { balanceNeededCents, getAvailableCents } from "@/features/wallet/service";
import { isAddressSnapshot } from "@/lib/address";
import { db } from "@/server/db";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 20;
const FILTERS = [
  { label: "All", value: undefined },
  { label: "To accept", value: "TO_ACCEPT" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Awaiting payment", value: "PENDING" },
  { label: "Cancelled", value: "CANCELLED" },
];

async function OrdersTable({ searchParams }: PageProps<"/dashboard/orders">) {
  const [{ store }, query] = await Promise.all([requireStoreOwner("/dashboard/orders"), searchParams]);
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const status = typeof query.status === "string" ? query.status : undefined;
  const [data, availableCents, waiting] = await Promise.all([
    listStoreOrders(store.id, { page, status, pageSize: PAGE_SIZE }),
    getAvailableCents(store.id),
    db.order.count({ where: { storeId: store.id, status: { in: WAITING_FOR_ACCEPTANCE } } }),
  ]);
  return (
    <>
      {waiting > 0 && status !== "TO_ACCEPT" && (
        <Alert tone="warning" title={`${waiting} order${waiting === 1 ? " is" : "s are"} waiting for you to accept`} className="mb-4">
          Nothing is fulfilled until you accept it.{" "}
          <Link href="/dashboard/orders?status=TO_ACCEPT" className="font-medium underline underline-offset-4">
            Show them
          </Link>
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <FilterLink key={filter.label} href={`/dashboard/orders${buildQuery(query, { status: filter.value ?? null, page: null })}`} active={status === filter.value}>
            {filter.label}
          </FilterLink>
        ))}
      </div>
      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Placed</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">You earn</Th>
            </tr>
          </thead>
          <tbody>
            {data.orders.length === 0 && <TableEmpty colSpan={7}>{status ? "No orders with this status." : "No orders yet. Share your store link to get your first sale."}</TableEmpty>}
            {data.orders.map((order) => {
              const address = isAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null;
              // On a phone the table scrolls sideways, so Accept also sits under the order number, in view.
              const accept = WAITING_FOR_ACCEPTANCE.includes(order.status) ? (
                <AcceptOrder
                  compact
                  order={{ id: order.id, number: order.number, currency: order.currency, fulfilmentCostCents: order.finance.fulfilmentCostCents }}
                  neededCents={balanceNeededCents(order)}
                  availableCents={availableCents}
                />
              ) : null;
              return (
                <tr key={order.id}>
                  <Td>
                    <Link href={`/dashboard/orders/${order.number}`} className="tabular font-medium text-ink-950 hover:underline">
                      {order.number}
                    </Link>
                    <p className="text-[0.8125rem] text-ink-500">
                      {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                    </p>
                    {accept && <div className="md:hidden">{accept}</div>}
                  </Td>
                  <Td>
                    <p className="text-ink-950">{address ? `${address.firstName} ${address.lastName}` : order.email}</p>
                    <p className="text-[0.8125rem] text-ink-500">{address ? `${address.city}, ${address.country}` : null}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">{dateTime.format(order.placedAt)}</Td>
                  <Td>
                    <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={statusTone(order.status)} />
                    {accept && <div className="hidden md:block">{accept}</div>}
                  </Td>
                  <Td>
                    <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
                  </Td>
                  <Td className="tabular text-right">{formatMoney(order.totalCents, order.currency)}</Td>
                  <Td className={cn("tabular text-right font-medium", order.status === "CANCELLED" ? "text-ink-400 line-through" : "text-success")}>
                    {formatMoney(order.finance.ownerEarningCents, order.currency)}
                    {order.finance.commissionCents > 0 && <span className="block text-[0.75rem] font-normal text-ink-500">after {formatMoney(order.finance.commissionCents, order.currency)} commission</span>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <AdminPagination basePath="/dashboard/orders" query={query} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={PAGE_SIZE} />
    </>
  );
}

export default function DashboardOrdersPage(props: PageProps<"/dashboard/orders">) {
  return (
    <>
      <PageHeader title="Orders" description="Every order placed in your store. Accept an order to send it to Zendropship, who fulfil it — statuses update here as it is packed, shipped and delivered." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OrdersTable {...props} />
      </Suspense>
    </>
  );
}
