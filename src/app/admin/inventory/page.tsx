import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { StockEditor } from "@/components/admin/inventory/stock-editor";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { getInventoryLedger, listInventory } from "@/features/admin/products/queries";
import { can, requirePagePermission } from "@/server/auth/guards";
import { cn } from "@/utils/cn";

export const metadata: Metadata = { title: "Inventory" };

async function Inventory({ searchParams }: PageProps<"/admin/inventory">) {
  const [user, query] = await Promise.all([requirePagePermission("products.view", "/admin/inventory"), searchParams]);
  const str = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const data = await listInventory({ q: str("q"), filter: str("filter"), page: Number(str("page") ?? 1) || 1 });
  const ledger = str("ledger") ? await getInventoryLedger(str("ledger")!) : null;
  const base = query as Record<string, string | string[] | undefined>;
  const canEdit = can(user, "inventory.update");

  return (
    <>
      <PageHeader title="Inventory" description="Stock levels per variant. Every change is recorded in the ledger." />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={`/admin/inventory${buildQuery(base, { filter: null, page: null })}`} active={!str("filter")}>
          All
        </FilterLink>
        <FilterLink href={`/admin/inventory${buildQuery(base, { filter: "low", page: null })}`} active={str("filter") === "low"}>
          Low stock
        </FilterLink>
        <FilterLink href={`/admin/inventory${buildQuery(base, { filter: "out", page: null })}`} active={str("filter") === "out"}>
          Out of stock
        </FilterLink>
      </div>
      <div className={cn("grid gap-6", ledger && "xl:grid-cols-3")}>
        <Card padded={false} className={cn(ledger && "xl:col-span-2")}>
          <form className="flex gap-2 border-b border-line px-5 py-3" method="get">
            {str("filter") && <input type="hidden" name="filter" value={str("filter")} />}
            <Input name="q" defaultValue={str("q") ?? ""} placeholder="Search SKU or product" className="h-9 max-w-sm" aria-label="Search inventory" />
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>
          <Table>
            <thead>
              <tr>
                <Th>Variant</Th>
                <Th>SKU</Th>
                <Th className="text-right">Stock</Th>
                <Th className="text-right">Low at</Th>
                <Th>Tracking</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {data.variants.length === 0 && <TableEmpty colSpan={6}>No variants match.</TableEmpty>}
              {data.variants.map((variant) => {
                const label = `${variant.product.name}${variant.title !== "Default" ? ` — ${variant.title}` : ""}`;
                const low = variant.trackInventory && variant.stockQuantity <= variant.lowStockThreshold;
                return (
                  <tr key={variant.id} className={cn("hover:bg-canvas/60", str("ledger") === variant.id && "bg-iris-50")}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-canvas">{variant.product.images[0] && <Image src={variant.product.images[0].media.url} alt="" fill sizes="40px" className="object-cover" />}</div>
                        <div className="min-w-0">
                          <Link href={`/admin/products/${variant.product.id}`} className="block truncate font-medium text-ink-950 hover:underline">
                            {variant.product.name}
                          </Link>
                          <span className="block text-[0.75rem] text-ink-500">
                            {variant.title}
                            {variant.product.status !== "ACTIVE" && ` · ${variant.product.status.toLowerCase()}`}
                          </span>
                        </div>
                      </div>
                    </Td>
                    <Td className="tabular text-ink-600">{variant.sku ?? "—"}</Td>
                    <Td className={cn("text-right font-medium", low && (variant.stockQuantity <= 0 ? "text-danger" : "text-warning"))}>{canEdit ? <StockEditor variantId={variant.id} current={variant.stockQuantity} label={label} /> : <span className="tabular">{variant.stockQuantity}</span>}</Td>
                    <Td className="tabular text-right text-ink-500">{variant.lowStockThreshold}</Td>
                    <Td className="text-ink-600">{variant.trackInventory ? (variant.allowBackorder ? "Backorders" : "Tracked") : "Not tracked"}</Td>
                    <Td className="text-right">
                      <Link href={`/admin/inventory${buildQuery(base, { ledger: variant.id })}`} className="text-[0.8125rem] underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
                        Ledger
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <AdminPagination basePath="/admin/inventory" query={base} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={50} />
        </Card>
        {ledger && (
          <Card title="Inventory ledger" padded={false} actions={<Link href={`/admin/inventory${buildQuery(base, { ledger: null })}`} className="text-sm text-ink-500 underline underline-offset-4">Close</Link>}>
            {ledger.length === 0 ? (
              <p className="px-5 py-8 text-sm text-ink-500">No movements yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {ledger.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <span className={cn("tabular font-semibold", entry.delta > 0 ? "text-success" : "text-danger")}>
                        {entry.delta > 0 ? "+" : ""}
                        {entry.delta}
                      </span>
                      <span className="tabular text-ink-500">→ {entry.balanceAfter}</span>
                    </div>
                    <p className="mt-0.5 text-ink-800">
                      {entry.reason.replace(/_/g, " ").toLowerCase()}
                      {entry.note ? ` · ${entry.note}` : ""}
                      {entry.order && (
                        <>
                          {" · "}
                          <Link href={`/admin/orders/${entry.order.id}`} className="underline underline-offset-2">
                            {entry.order.number}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="text-[0.75rem] text-ink-500">
                      {dateTime.format(entry.createdAt)}
                      {entry.actor ? ` · ${entry.actor.firstName} ${entry.actor.lastName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

export default function InventoryPage(props: PageProps<"/admin/inventory">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Inventory {...props} />
    </Suspense>
  );
}
