import type { OrderStatus } from "@/generated/prisma/enums";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/forms";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { acceptOrderAction, setOrderStatusAction } from "@/features/admin/orders/actions";
import { listOrders, OPEN_FILTER } from "@/features/admin/orders/queries";
import { fulfilmentHint, nextFulfilmentStep } from "@/features/orders/progress";
import { ORDER_STATUS_LABELS, OPEN_STATUSES, PAYMENT_STATUS_LABELS, paymentTone, statusTone } from "@/features/orders/status";
import { can, requirePagePermission } from "@/server/auth/guards";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Orders" };

const STATUS_FILTERS = ["", "PENDING", "CONFIRMED", "AWAITING_FUNDS", "ACCEPTED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as const;

async function OrdersTable({ searchParams }: PageProps<"/admin/orders">) {
  const user = await requirePagePermission("orders.view", "/admin/orders");
  const canUpdate = can(user, "orders.update");
  const query = await searchParams;
  const str = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const data = await listOrders({ q: str("q"), status: str("status"), payment: str("payment"), from: str("from"), to: str("to"), store: str("store"), page: Number(str("page") ?? 1) || 1 });
  const base = query as Record<string, string | string[] | undefined>;
  const openCount = OPEN_STATUSES.reduce((sum, status) => sum + (data.statusCounts[status] ?? 0), 0);

  return (
    <>
      <PageHeader title="Orders" description={`${data.total.toLocaleString("en-US")} orders`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={`/admin/orders${buildQuery(base, { status: OPEN_FILTER, page: null })}`} active={str("status") === OPEN_FILTER}>
          To fulfil
          {openCount > 0 ? <span className="tabular ml-1.5 opacity-60">{openCount}</span> : null}
        </FilterLink>
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
              {canUpdate && <Th className="hidden text-right md:table-cell">Next step</Th>}
            </tr>
          </thead>
          <tbody>
            {data.orders.length === 0 && <TableEmpty colSpan={canUpdate ? 8 : 7}>No orders match these filters.</TableEmpty>}
            {data.orders.map((order) => (
              <tr key={order.id} className="hover:bg-canvas/60">
                <Td>
                  <Link href={`/admin/orders/${order.id}`} className="tabular whitespace-nowrap font-medium text-ink-950 hover:underline">
                    {order.number}
                  </Link>
                  <span className="block text-[0.75rem] text-ink-500">
                    {order._count.items} item{order._count.items === 1 ? "" : "s"}
                  </span>
                  {canUpdate && <span className="mt-1.5 block md:hidden">{nextStepButton(order)}</span>}
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
                  <span className="mt-0.5 block text-[0.75rem] text-ink-500">{fulfilmentHint(order.status)}</span>
                </Td>
                <Td>
                  <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
                  <span className="ml-1.5 text-[0.75rem] text-ink-500">{order.paymentProvider}</span>
                </Td>
                <Td className="tabular text-right font-medium">{formatMoney(order.totalCents, order.currency)}</Td>
                {canUpdate && <Td className="hidden whitespace-nowrap text-right md:table-cell">{nextStepButton(order)}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
        <AdminPagination basePath="/admin/orders" query={base} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={25} />
      </Card>
    </>
  );
}

/**
 * One click for the step staff take next. Accepting goes through the funding check (which charges the
 * owner's balance once); everything after it is a plain status move. Cancelled and delivered orders have none.
 */
function nextStepButton(order: { id: string; number: string; status: OrderStatus }) {
  const next = nextFulfilmentStep(order.status);
  if (!next) return <span className="text-[0.8125rem] text-ink-400">{order.status === "DELIVERED" ? "Complete" : "—"}</span>;
  const action = next.status === "ACCEPTED" ? acceptOrderAction.bind(null, order.id) : setOrderStatusAction.bind(null, order.id, next.status, undefined);
  return (
    <ActionButton
      action={action}
      size="xs"
      variant={next.status === "ACCEPTED" ? "primary" : "secondary"}
      confirm={next.confirm ? { title: `${next.label} — order ${order.number}?`, description: next.confirm, confirmLabel: next.label } : undefined}
    >
      {next.short}
    </ActionButton>
  );
}

export default function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OrdersTable {...props} />
    </Suspense>
  );
}
