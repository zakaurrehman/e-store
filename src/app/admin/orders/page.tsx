import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { listOrders } from "@/features/admin/orders/queries";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, statusTone } from "@/features/orders/status";
import { requirePagePermission } from "@/server/auth/guards";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Orders" };

const STATUS_FILTERS = ["", "PENDING", "CONFIRMED", "AWAITING_FUNDS", "ACCEPTED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as const;

async function OrdersTable({ searchParams }: PageProps<"/admin/orders">) {
  await requirePagePermission("orders.view", "/admin/orders");
  const query = await searchParams;
  const str = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const data = await listOrders({ q: str("q"), status: str("status"), payment: str("payment"), from: str("from"), to: str("to"), store: str("store"), page: Number(str("page") ?? 1) || 1 });
  const base = query as Record<string, string | string[] | undefined>;

  return (
    <>
      <PageHeader title="Orders" description={`${data.total.toLocaleString("en-US")} orders`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <FilterLink key={status || "all"} href={`/admin/orders${buildQuery(base, { status: status || null, page: null })}`} active={(str("status") ?? "") === status}>
            {status ? ORDER_STATUS_LABELS[status] : "All"}
            {status && data.statusCounts[status] ? <span className="tabular ml-1.5 opacity-60">{data.statusCounts[status]}</span> : null}
          </FilterLink>
        ))}
      </div>
      <Card padded={false}>
        <form className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-3" method="get">
          {str("status") && <input type="hidden" name="status" value={str("status")} />}
          <div className="min-w-[14rem] flex-1">
            <Input name="q" defaultValue={str("q") ?? ""} placeholder="Search order #, email, customer, product, tracking" className="h-9" aria-label="Search orders" />
          </div>
          <div className="w-44">
            <Select name="payment" defaultValue={str("payment") ?? ""} className="h-9" aria-label="Payment status">
              <option value="">Any payment</option>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <Input type="date" name="from" defaultValue={str("from") ?? ""} className="h-9 w-40" aria-label="From date" />
          <Input type="date" name="to" defaultValue={str("to") ?? ""} className="h-9 w-40" aria-label="To date" />
          <Button type="submit" size="sm" variant="secondary">
            Filter
          </Button>
          {(str("q") || str("payment") || str("from") || str("to")) && (
            <Link href={`/admin/orders${buildQuery({}, { status: str("status") ?? null })}`} className="text-sm text-ink-600 underline underline-offset-4">
              Clear
            </Link>
          )}
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Store</Th>
              <Th>Placed</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {data.orders.length === 0 && <TableEmpty colSpan={7}>No orders match these filters.</TableEmpty>}
            {data.orders.map((order) => (
              <tr key={order.id} className="hover:bg-canvas/60">
                <Td>
                  <Link href={`/admin/orders/${order.id}`} className="tabular font-medium text-ink-950 hover:underline">
                    {order.number}
                  </Link>
                  <span className="block text-[0.75rem] text-ink-500">
                    {order._count.items} item{order._count.items === 1 ? "" : "s"}
                  </span>
                </Td>
                <Td>
                  <span className="block">{order.user ? `${order.user.firstName} ${order.user.lastName}` : "Guest"}</span>
                  <span className="block text-[0.75rem] text-ink-500">{order.email}</span>
                </Td>
                <Td>
                  <Link href={`/admin/orders${buildQuery(base, { store: order.store.slug, page: null })}`} className="text-ink-800 hover:underline">
                    {order.store.name}
                  </Link>
                  {!order.store.ownerId && <span className="block text-[0.75rem] text-ink-500">Platform store</span>}
                </Td>
                <Td className="whitespace-nowrap text-ink-600">{dateTime.format(order.placedAt)}</Td>
                <Td>
                  <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={statusTone(order.status)} />
                </Td>
                <Td>
                  <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
                  <span className="ml-1.5 text-[0.75rem] text-ink-500">{order.paymentProvider}</span>
                </Td>
                <Td className="tabular text-right font-medium">{formatMoney(order.totalCents, order.currency)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <AdminPagination basePath="/admin/orders" query={base} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={25} />
      </Card>
    </>
  );
}

export default function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OrdersTable {...props} />
    </Suspense>
  );
}
