import { ArrowUpRight, PackageCheck, RefreshCw, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToStoreButton } from "@/components/platform/add-to-store-button";
import { CatalogGrid, marginAt } from "@/components/platform/catalog-card";
import { ProductGallery } from "@/components/store/product/gallery";
import { MarkdownContent } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/misc";
import { getProductBySlug, getRelatedProducts, type ProductDetail } from "@/features/catalog/queries";
import { commissionRuleOf, formatRate, type CommissionRule } from "@/features/finance/order-finance";
import { getStoreSettings } from "@/features/settings/queries";
import { getOwnedStore, getPlatformStore, getShelfProductIds } from "@/features/stores/queries";
import { storeUrl } from "@/lib/tenancy";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatMoney } from "@/utils/money";

export async function generateMetadata({ params }: PageProps<"/catalog/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  return {
    title: `Sell ${product.name}`,
    description: `Add ${product.name} to your Zendropship store: wholesale ${formatMoney(product.costCents)}, suggested price ${formatMoney(product.priceCents)}.`,
    alternates: { canonical: `/catalog/p/${product.slug}` },
    openGraph: { images: product.images[0] ? [{ url: product.images[0].url }] : undefined },
  };
}

function VariantTable({ product, commission }: { product: ProductDetail; commission: CommissionRule }) {
  if (product.variants.length <= 1) return null;
  return (
    <div className="mt-8 overflow-x-auto rounded-md border border-line">
      <table className="tabular w-full min-w-[28rem] text-left text-[0.875rem]">
        <thead className="bg-canvas text-2xs uppercase tracking-[0.08em] text-ink-500">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Option</th>
            <th className="px-3 py-2.5 font-semibold">You pay</th>
            <th className="px-3 py-2.5 font-semibold">Sells for</th>
            <th className="px-3 py-2.5 font-semibold">You earn</th>
            <th className="px-3 py-2.5 font-semibold">Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {product.variants.map((variant) => {
            const margin = marginAt(variant.priceCents, variant.costCents, commission);
            return (
              <tr key={variant.id}>
                <td className="px-3 py-2.5 text-ink-950">{variant.title}</td>
                <td className="px-3 py-2.5">{formatMoney(variant.costCents)}</td>
                <td className="px-3 py-2.5">{formatMoney(variant.priceCents)}</td>
                <td className="px-3 py-2.5 text-success">{formatMoney(margin.cents)}</td>
                <td className="px-3 py-2.5 text-ink-600">{!variant.available ? "Out of stock" : variant.stockQuantity === null ? "Available" : `${variant.stockQuantity} in stock`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function OwnerActions({ product }: { product: ProductDetail }) {
  const user = await getCurrentUser();
  const store = user ? await getOwnedStore(user.id) : null;
  const shelf = store ? await getShelfProductIds(store.id) : [];
  const demo = await getPlatformStore();
  const inDemo = !!(await db.storeProduct.findFirst({ where: { storeId: demo.id, productId: product.id, isActive: true }, select: { id: true } }));
  return (
    <div className="space-y-3">
      <AddToStoreButton productId={product.id} productName={product.name} inStore={shelf.includes(product.id)} signedIn={!!user} size="lg" fullWidth />
      {inDemo && (
        <a href={`${storeUrl(demo.slug)}/p/${product.slug}`} className="flex items-center justify-center gap-1.5 text-sm text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
          See how it looks in a store <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}

async function Related({ product }: { product: ProductDetail }) {
  const related = await getRelatedProducts(product.id, product.category?.id ?? null, product.brand?.id ?? null, 4);
  if (related.length === 0) return null;
  const [user, settings] = await Promise.all([getCurrentUser(), getStoreSettings()]);
  const store = user ? await getOwnedStore(user.id) : null;
  const shelf = store ? await getShelfProductIds(store.id) : [];
  return (
    <section className="mt-20 border-t border-line pt-12">
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">More to sell alongside it</h2>
      <CatalogGrid products={related} inStoreIds={shelf} signedIn={!!user} commission={commissionRuleOf(settings.platform)} className="mt-8" />
    </section>
  );
}

async function ProductContent({ params }: PageProps<"/catalog/p/[slug]">) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProductBySlug(slug), getStoreSettings()]);
  if (!product) notFound();
  const commission = commissionRuleOf(settings.platform);
  const margin = marginAt(product.priceCents, product.costCents, commission);
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
        <Link href="/catalog" className="hover:text-ink-950">
          Catalogue
        </Link>
        {product.category?.parent && (
          <>
            {" / "}
            <Link href={`/catalog/c/${product.category.parent.slug}`} className="hover:text-ink-950">
              {product.category.parent.name}
            </Link>
          </>
        )}
        {product.category && (
          <>
            {" / "}
            <Link href={`/catalog/c/${product.category.slug}`} className="hover:text-ink-950">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>
      <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <ProductGallery images={product.images} productName={product.name} />
        </div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            {product.brand && <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">{product.brand.name}</p>}
            <h1 className="mt-2 text-balance text-3xl font-semibold leading-tight tracking-[-0.025em] text-ink-950 md:text-[2.25rem]">{product.name}</h1>
            {product.shortDescription && <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-600">{product.shortDescription}</p>}

            <dl className="tabular mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
              <div className="bg-surface p-4">
                <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">You pay</dt>
                <dd className="mt-1.5 text-xl font-semibold text-ink-950">{formatMoney(product.costCents)}</dd>
              </div>
              <div className="bg-surface p-4">
                <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">Sells for</dt>
                <dd className="mt-1.5 text-xl font-semibold text-ink-950">{formatMoney(product.priceCents)}</dd>
              </div>
              <div className="bg-surface p-4">
                <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">You earn</dt>
                <dd className="mt-1.5 text-xl font-semibold text-success">
                  {formatMoney(margin.cents)} <span className="text-sm font-medium">({margin.percent}%)</span>
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[0.8125rem] text-ink-500">
              At the suggested price, after the wholesale cost{commission.rateBps > 0 ? ` and Zendropship's ${formatRate(commission.rateBps)} commission` : ""}. You can set your own price in your dashboard.
            </p>

            <div className="mt-7">
              <Suspense fallback={<Skeleton className="h-13 w-full rounded-md" />}>
                <OwnerActions product={product} />
              </Suspense>
            </div>

            <ul className="mt-8 space-y-3 border-t border-line pt-6 text-[0.9375rem] text-ink-700">
              <li className="flex gap-3">
                <PackageCheck className="mt-0.5 size-4 shrink-0 text-ink-950" aria-hidden /> Orders for this product go straight to Zendropship fulfilment.
              </li>
              <li className="flex gap-3">
                <Truck className="mt-0.5 size-4 shrink-0 text-ink-950" aria-hidden /> We pack and ship it to your customer; they get tracking by email.
              </li>
              <li className="flex gap-3">
                <RefreshCw className="mt-0.5 size-4 shrink-0 text-ink-950" aria-hidden />
                {product.inStock ? "In stock now — your store shows live availability." : "Out of stock right now — stores show it as sold out until it is back."}
              </li>
            </ul>
            <VariantTable product={product} commission={commission} />
          </div>
        </div>
      </div>
      {product.description && (
        <section className="mt-16 max-w-3xl">
          <h2 className="text-xl font-semibold tracking-[-0.015em] text-ink-950">Product description</h2>
          <div className="mt-4">
            <MarkdownContent content={product.description} />
          </div>
        </section>
      )}
      <Suspense fallback={null}>
        <Related product={product} />
      </Suspense>
    </>
  );
}

export default function CatalogProductPage(props: PageProps<"/catalog/p/[slug]">) {
  return (
    <div className="container-page pb-20 pt-8">
      <Suspense
        fallback={
          <div className="grid gap-8 lg:grid-cols-12">
            <Skeleton className="aspect-[4/5] rounded-lg lg:col-span-7" />
            <Skeleton className="h-96 lg:col-span-5" />
          </div>
        }
      >
        <ProductContent {...props} />
      </Suspense>
    </div>
  );
}
