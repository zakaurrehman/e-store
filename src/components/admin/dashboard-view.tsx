import Link from "next/link";
import { HorizontalBars, TimeSeriesChart } from "@/components/admin/charts";
import { Card, dateTime, FilterLink, StatTile, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import type { DashboardData } from "@/features/admin/dashboard";
import { RANGES } from "@/features/admin/dashboard";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, statusTone } from "@/features/orders/status";
import { formatMoney } from "@/utils/money";

const compact = (cents: number) => {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${(dollars / 1000).toFixed(1)}K`;
  return formatMoney(cents);
};
const deltaHint = (delta: number | null, label: string) => (delta === null ? `vs ${label}: —` : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs ${label}`);

export function RangeFilter({ current, basePath }: { current: string; basePath: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Date range">
      {RANGES.map((range) => (
        <FilterLink key={range.key} href={`${basePath}?range=${range.key}`} active={current === range.key}>
          {range.label}
        </FilterLink>
      ))}
    </div>
  );
}

export function DashboardView({ data, detailed = false }: { data: DashboardData; detailed?: boolean }) {
  const { kpis, series } = data;
  const previousLabel = "previous period";
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Revenue" value={compact(kpis.revenueCents)} hint={deltaHint(kpis.revenueDelta, previousLabel)} />
        <StatTile label="Orders" value={kpis.orders.toLocaleString("en-US")} hint={deltaHint(kpis.ordersDelta, previousLabel)} href="/admin/orders" />
        <StatTile label="Average order value" value={formatMoney(kpis.aovCents)} hint={deltaHint(kpis.aovDelta, previousLabel)} />
        <StatTile label="Returning customers" value={kpis.returningRate === null ? "—" : `${kpis.returningRate}%`} hint={`${kpis.customersNew} new · ${kpis.customersTotal.toLocaleString("en-US")} total`} href="/admin/customers" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Awaiting fulfilment" value={kpis.pendingFulfilment} tone={kpis.pendingFulfilment > 0 ? "warning" : "default"} href="/admin/orders?status=CONFIRMED" />
        <StatTile label="Failed payments" value={kpis.failedPayments} tone={kpis.failedPayments > 0 ? "danger" : "default"} href="/admin/orders?payment=FAILED" />
        <StatTile label="Low stock variants" value={data.lowStock.length} tone={data.lowStock.length > 0 ? "warning" : "default"} href="/admin/inventory?filter=low" />
        <StatTile label="Reviews to moderate" value={kpis.pendingReviews} href="/admin/reviews?status=PENDING" hint={kpis.newMessages > 0 ? `${kpis.newMessages} new message${kpis.newMessages === 1 ? "" : "s"}` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Revenue" description={`Paid orders, net of refunds · by ${series.bucket}`} className="xl:col-span-2">
          <TimeSeriesChart points={series.revenue} bucket={series.bucket} format="money-compact" valueLabel="Revenue" />
        </Card>
        <Card title="Orders" description={`Placed orders · by ${series.bucket}`}>
          <TimeSeriesChart points={series.orders} bucket={series.bucket} format="count" valueLabel="Orders" kind="column" />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Top products" description="By revenue in the period">
          <HorizontalBars rows={data.topProducts.map((product) => ({ key: product.id, label: product.name, value: product.revenueCents }))} format="money" valueLabel="Revenue" hrefBase="/admin/products/" />
        </Card>
        <Card title="Top categories" description="By revenue in the period">
          <HorizontalBars rows={data.topCategories.map((category) => ({ key: category.slug, label: category.name, value: category.revenueCents }))} format="money" valueLabel="Revenue" />
        </Card>
        <Card title="New customers" description={`Registrations · by ${series.bucket}`}>
          <TimeSeriesChart points={series.customers} bucket={series.bucket} format="count" valueLabel="Customers" kind="column" height={200} />
        </Card>
      </div>

      {detailed && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Orders by status" description="Orders placed in the period">
            <ul className="divide-y divide-line text-sm">
              {Object.entries(ORDER_STATUS_LABELS).map(([status, label]) => (
                <li key={status} className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-2">
                    <StatusBadge label={label} tone={statusTone(status as keyof typeof ORDER_STATUS_LABELS)} />
                  </span>
                  <span className="tabular font-medium">{data.statusCounts[status] ?? 0}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Inventory overview">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Units on hand</dt>
                <dd className="tabular font-medium">{kpis.inventoryUnits.toLocaleString("en-US")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Stock value (cost or price)</dt>
                <dd className="tabular font-medium">{formatMoney(kpis.inventoryValueCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Variants at or below threshold</dt>
                <dd className="tabular font-medium">{data.lowStock.length}</dd>
              </div>
            </dl>
            <Link href="/admin/inventory" className="mt-4 inline-block text-sm font-medium underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
              Open inventory
            </Link>
          </Card>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Recent orders" padded={false} className="xl:col-span-2" actions={<Link href="/admin/orders" className="text-sm underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">All orders</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.length === 0 && <TableEmpty colSpan={5}>No orders yet.</TableEmpty>}
              {data.recentOrders.map((order) => (
                <tr key={order.id}>
                  <Td>
                    <Link href={`/admin/orders/${order.id}`} className="tabular font-medium text-ink-950 hover:underline">
                      {order.number}
                    </Link>
                    <span className="block text-[0.75rem] text-ink-500">{dateTime.format(order.placedAt)}</span>
                  </Td>
                  <Td>{order.user ? `${order.user.firstName} ${order.user.lastName}` : order.email}</Td>
                  <Td>
                    <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={statusTone(order.status)} />
                  </Td>
                  <Td>
                    <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
                  </Td>
                  <Td className="tabular text-right font-medium">{formatMoney(order.totalCents, order.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Low stock" padded={false} actions={<Link href="/admin/inventory?filter=low" className="text-sm underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">Inventory</Link>}>
          {data.lowStock.length === 0 ? (
            <p className="px-5 py-8 text-center text-[0.8125rem] text-ink-500">All variants are above their thresholds.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.lowStock.map((variant) => (
                <li key={variant.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0">
                    <Link href={`/admin/products/${variant.productId}`} className="block truncate font-medium text-ink-950 hover:underline">
                      {variant.productName}
                    </Link>
                    <span className="block text-[0.75rem] text-ink-500">
                      {variant.title !== "Default" ? `${variant.title} · ` : ""}
                      {variant.sku ?? "no SKU"}
                    </span>
                  </span>
                  <span className={`tabular shrink-0 rounded-xs px-1.5 py-0.5 text-[0.75rem] font-semibold ${variant.stockQuantity <= 0 ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>{variant.stockQuantity} left</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
