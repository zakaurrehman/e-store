import { Download, Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductTable } from "@/components/admin/products/product-table";
import { AdminPagination, buildQuery, Card, dateOnly, FilterLink, PageHeader } from "@/components/admin/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { listAdminProducts, PRODUCT_PAGE_SIZE } from "@/features/admin/products/queries";
import { can, requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Products" };

async function Products({ searchParams }: PageProps<"/admin/products">) {
  const [user, query] = await Promise.all([requirePagePermission("products.view", "/admin/products"), searchParams]);
  const str = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const [data, categories, brands] = await Promise.all([
    listAdminProducts({ q: str("q"), status: str("status"), category: str("category"), brand: str("brand"), stock: str("stock"), sort: str("sort"), page: Number(str("page") ?? 1) || 1 }),
    db.category.findMany({ where: { deletedAt: null }, orderBy: [{ position: "asc" }], select: { slug: true, name: true, parent: { select: { name: true } } } }),
    db.brand.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { slug: true, name: true } }),
  ]);
  const base = query as Record<string, string | string[] | undefined>;
  const total = Object.values(data.statusCounts).reduce((sum, count) => sum + count, 0);

  return (
    <>
      <PageHeader
        title="Products"
        description={`${total.toLocaleString("en-US")} products`}
        actions={
          <>
            {can(user, "products.export") && (
              <a href="/api/admin/products/export" className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-3.5 text-sm font-medium hover:border-ink-950">
                <Download className="size-4" /> Export CSV
              </a>
            )}
            {can(user, "products.import") && (
              <ButtonLink href="/admin/imports" variant="secondary" size="sm">
                <Upload className="size-4" /> Import
              </ButtonLink>
            )}
            {can(user, "products.create") && (
              <ButtonLink href="/admin/products/new" size="sm">
                <Plus className="size-4" /> New product
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["", "All"],
          ["ACTIVE", "Active"],
          ["DRAFT", "Draft"],
          ["ARCHIVED", "Archived"],
        ].map(([value, label]) => (
          <FilterLink key={value || "all"} href={`/admin/products${buildQuery(base, { status: value || null, page: null })}`} active={(str("status") ?? "") === value}>
            {label}
            {value && data.statusCounts[value] ? <span className="tabular ml-1.5 opacity-60">{data.statusCounts[value]}</span> : null}
          </FilterLink>
        ))}
        <FilterLink href={`/admin/products${buildQuery(base, { stock: str("stock") === "low" ? null : "low", page: null })}`} active={str("stock") === "low"}>
          Low stock
        </FilterLink>
        <FilterLink href={`/admin/products${buildQuery(base, { stock: str("stock") === "out" ? null : "out", page: null })}`} active={str("stock") === "out"}>
          Sold out
        </FilterLink>
      </div>
      <Card padded={false}>
        <form className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-3" method="get">
          {str("status") && <input type="hidden" name="status" value={str("status")} />}
          {str("stock") && <input type="hidden" name="stock" value={str("stock")} />}
          <div className="min-w-[14rem] flex-1">
            <Input name="q" defaultValue={str("q") ?? ""} placeholder="Search name, SKU or brand" className="h-9" aria-label="Search products" />
          </div>
          <div className="w-48">
            <Select name="category" defaultValue={str("category") ?? ""} className="h-9" aria-label="Category">
              <option value="">Any category</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.parent ? `${category.parent.name} › ` : ""}
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select name="brand" defaultValue={str("brand") ?? ""} className="h-9" aria-label="Brand">
              <option value="">Any brand</option>
              {brands.map((brand) => (
                <option key={brand.slug} value={brand.slug}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select name="sort" defaultValue={str("sort") ?? ""} className="h-9" aria-label="Sort">
              <option value="">Recently updated</option>
              <option value="name">Name A–Z</option>
              <option value="price">Price high–low</option>
              <option value="stock">Stock low–high</option>
              <option value="sales">Best selling</option>
            </Select>
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Apply
          </Button>
          {(str("q") || str("category") || str("brand") || str("sort")) && (
            <Link href="/admin/products" className="text-sm text-ink-600 underline underline-offset-4">
              Clear
            </Link>
          )}
        </form>
        <ProductTable
          rows={data.products.map((product) => ({
            id: product.id,
            name: product.name,
            slug: product.slug,
            status: product.status,
            imageUrl: product.images[0]?.media.url ?? null,
            brand: product.brand?.name ?? null,
            category: product.primaryCategory?.name ?? null,
            priceCents: product.priceCents,
            maxPriceCents: product.maxPriceCents,
            totalStock: product.totalStock,
            inStock: product.inStock,
            variantCount: product._count.variants,
            salesCount: product.salesCount,
            updatedAt: dateOnly.format(product.updatedAt),
          }))}
          permissions={{ update: can(user, "products.update"), delete: can(user, "products.delete"), inventory: can(user, "inventory.update") }}
        />
        <AdminPagination basePath="/admin/products" query={base} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={PRODUCT_PAGE_SIZE} />
      </Card>
    </>
  );
}

export default function AdminProductsPage(props: PageProps<"/admin/products">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Products {...props} />
    </Suspense>
  );
}
