import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPagination, Card, FilterLink, PageHeader, StatusBadge, Table, TableEmpty, Td, Th, buildQuery, dateTime } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, statusTone } from "@/features/orders/status";
import { listStoreOrders } from "@/features/stores/dashboard";
import { requireStoreOwner } from "@/features/stores/guards";
import { isAddressSnapshot } from "@/lib/address";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 20;
const FILTERS = [
  { label: "All", value: undefined },
  { label: "With fulfilment", value: "PROCESSING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Awaiting payment", value: "PENDING" },
  { label: "Cancelled", value: "CANCELLED" },
];

async function OrdersTable({ searchParams }: PageProps<"/dashboard/orders">) {
  const [{ store }, query] = await Promise.all([requireStoreOwner("/dashboard/orders"), searchParams]);
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const status = typeof query.status === "string" ? query.status : undefined;
  const data = await listStoreOrders(store.id, { page, status, pageSize: PAGE_SIZE });
  return (
    <>
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
              return (
                <tr key={order.id}>
                  <Td>
                    <Link href={`/dashboard/orders/${order.number}`} className="tabular font-medium text-ink-950 hover:underline">
                      {order.number}
                    </Link>
                    <p className="text-[0.8125rem] text-ink-500">
                      {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                    </p>
                  </Td>
                  <Td>
                    <p className="text-ink-950">{address ? `${address.firstName} ${address.lastName}` : order.email}</p>
                    <p className="text-[0.8125rem] text-ink-500">{address ? `${address.city}, ${address.country}` : null}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">{dateTime.format(order.placedAt)}</Td>
                  <Td>
                    <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={statusTone(order.status)} />
                  </Td>
                  <Td>
                    <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
                  </Td>
                  <Td className="tabular text-right">{formatMoney(order.totalCents, order.currency)}</Td>
                  <Td className={cn("tabular text-right font-medium", order.status === "CANCELLED" ? "text-ink-400 line-through" : "text-success")}>{formatMoney(order.marginCents, order.currency)}</Td>
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
      <PageHeader title="Orders" description="Every order placed in your store. Fulfilment is handled by Zendropship — statuses update here as orders are packed, shipped and delivered." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OrdersTable {...props} />
      </Suspense>
    </>
  );
}
