import { Search } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { AdminPagination, Card, PageHeader, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { ProductPriceEditor, RemoveProductButton, VisibilityToggle } from "@/components/dashboard/controls";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { commissionRuleOf } from "@/features/finance/order-finance";
import { getStoreSettings } from "@/features/settings/queries";
import { listStoreProducts } from "@/features/stores/dashboard";
import { requireStoreOwner } from "@/features/stores/guards";
import { storeUrl } from "@/lib/tenancy";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 25;

async function ProductsTable({ searchParams }: PageProps<"/dashboard/products">) {
  const [{ store }, query] = await Promise.all([requireStoreOwner("/dashboard/products"), searchParams]);
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const q = typeof query.q === "string" ? query.q : "";
  const rule = { mode: store.pricingMode, markupBps: store.markupBps };
  const commission = commissionRuleOf((await getStoreSettings()).platform);
  const data = await listStoreProducts({ id: store.id, pricing: rule }, { page, q, pageSize: PAGE_SIZE, commission });
  const url = storeUrl(store.slug);

  return (
    <>
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <label htmlFor="product-search" className="sr-only">
          Search your products
        </label>
        <Input id="product-search" name="q" defaultValue={q} placeholder="Search your products" />
        <button type="submit" className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface hover:border-ink-950" aria-label="Search">
          <Search className="size-4" />
        </button>
      </form>
      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th className="text-right">You pay</Th>
              <Th className="text-right">Sells for</Th>
              <Th className="text-right">You earn</Th>
              <Th>Price rule</Th>
              <Th>Stock</Th>
              <Th>Live</Th>
              <Th className="w-10">
                <span className="sr-only">Remove</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <TableEmpty colSpan={8}>
                {q ? (
                  "No products in your store match that search."
                ) : (
                  <div className="py-6">
                    <p className="text-[0.9375rem] font-medium text-ink-950">Your store has no products yet</p>
                    <p className="mt-1 text-sm text-ink-500">Add products from the catalogue and they appear in your store immediately.</p>
                    <ButtonLink href="/catalog" size="sm" className="mt-4">
                      Browse the catalogue
                    </ButtonLink>
                  </div>
                )}
              </TableEmpty>
            )}
            {data.rows.map((row) => (
              <tr key={row.productId} className={cn(!row.isActive && "bg-canvas/60")}>
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-canvas">{row.imageUrl && <Image src={row.imageUrl} alt="" fill sizes="48px" className="object-cover" />}</div>
                    <div className="min-w-0">
                      <a href={`${url}/p/${row.slug}`} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-medium text-ink-950 hover:underline">
                        {row.name}
                      </a>
                      {row.brand && <p className="text-[0.8125rem] text-ink-500">{row.brand}</p>}
                    </div>
                  </div>
                </Td>
                <Td className="tabular text-right">{formatMoney(row.costCents)}</Td>
                <Td className="tabular text-right font-medium">
                  {row.maxPriceCents > row.priceCents && <span className="font-normal text-ink-500">from </span>}
                  {formatMoney(row.priceCents)}
                </Td>
                <Td className={cn("tabular text-right font-medium", row.marginCents > 0 ? "text-success" : "text-danger")}>{formatMoney(row.marginCents)}</Td>
                <Td>
                  <ProductPriceEditor row={row} storeRule={rule} commission={commission} />
                </Td>
                <Td className="text-[0.8125rem]">
                  {!row.sellable ? <span className="text-danger">Withdrawn by supplier</span> : row.inStock ? <span className="text-ink-600">{row.stock} available</span> : <span className="text-warning">Out of stock</span>}
                </Td>
                <Td>
                  <VisibilityToggle productId={row.productId} isActive={row.isActive} disabled={!row.sellable} />
                </Td>
                <Td>
                  <RemoveProductButton productId={row.productId} productName={row.name} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <AdminPagination basePath="/dashboard/products" query={query} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={PAGE_SIZE} />
    </>
  );
}

export default function DashboardProductsPage(props: PageProps<"/dashboard/products">) {
  return (
    <>
      <PageHeader
        title="Products"
        description="What your store sells. Stock and wholesale prices come from the catalogue and update on their own."
        actions={
          <ButtonLink href="/catalog" size="sm">
            Add products
          </ButtonLink>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ProductsTable {...props} />
      </Suspense>
    </>
  );
}
