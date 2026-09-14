import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { absolute, JsonLd } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { BoughtTogether } from "@/components/store/product/bought-together";
import { ProductGallery } from "@/components/store/product/gallery";
import { ProductRail } from "@/components/store/product/product-rail";
import { PurchasePanel } from "@/components/store/product/purchase-panel";
import { RecentlyViewedRail, RecentlyViewedTracker } from "@/components/store/product/recently-viewed";
import { ReviewsSection } from "@/components/store/product/reviews-section";
import { MarkdownContent } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/misc";
import { RatingSummary } from "@/components/ui/rating";
import { getShippingOptions } from "@/features/checkout/shipping";
import { getBoughtTogether, getProductBySlug, getRelatedProducts, type ProductDetail } from "@/features/catalog/queries";
import { getStoreSettings } from "@/features/settings/queries";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const title = product.seoTitle ?? `${product.name}${product.brand ? ` by ${product.brand.name}` : ""}`;
  const description = product.seoDescription ?? product.shortDescription ?? `Shop ${product.name} at Veyora.`;
  const image = product.images[0];
  return {
    title,
    description,
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: { title, description, url: `/p/${product.slug}`, type: "website", images: image ? [{ url: image.url, width: image.width, height: image.height, alt: image.alt }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image.url] : undefined },
  };
}

function productJsonLd(product: ProductDetail, currency: string) {
  const availability = product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription ?? product.seoDescription ?? undefined,
    image: product.images.map((image) => absolute(image.url)),
    sku: product.variants[0]?.sku ?? undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    category: product.category?.name,
    offers:
      product.variants.length > 1
        ? {
            "@type": "AggregateOffer",
            priceCurrency: currency,
            lowPrice: (product.priceCents / 100).toFixed(2),
            highPrice: (product.maxPriceCents / 100).toFixed(2),
            offerCount: product.variants.length,
            availability,
            url: absolute(`/p/${product.slug}`),
          }
        : {
            "@type": "Offer",
            priceCurrency: currency,
            price: (product.priceCents / 100).toFixed(2),
            availability,
            itemCondition: "https://schema.org/NewCondition",
            url: absolute(`/p/${product.slug}`),
          },
    ...(product.ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAverage.toFixed(1), reviewCount: product.ratingCount } } : {}),
  };
}

function Details({ product, returnWindowDays }: { product: ProductDetail; returnWindowDays: number }) {
  const sections = [
    product.description ? { id: "description", title: "Description", body: <MarkdownContent content={product.description} /> } : null,
    product.specifications.length > 0 || product.facts.length > 0
      ? {
          id: "specifications",
          title: "Specifications",
          body: (
            <dl className="divide-y divide-line text-[0.9375rem]">
              {[...product.facts.map((fact) => ({ label: fact.attribute, value: fact.value })), ...product.specifications].map((row, index) => (
                <div key={`${row.label}-${index}`} className="grid grid-cols-[9rem_1fr] gap-4 py-2.5">
                  <dt className="text-ink-500">{row.label}</dt>
                  <dd className="text-ink-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          ),
        }
      : null,
    product.careInstructions ? { id: "care", title: "Care", body: <p className="text-[0.9375rem] leading-relaxed text-ink-700">{product.careInstructions}</p> } : null,
    {
      id: "shipping",
      title: "Shipping & returns",
      body: (
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink-700">
          {product.shippingNote && <p>{product.shippingNote}</p>}
          <p>Orders placed before 2 pm on business days are dispatched the same day. Delivery options and costs for your address are shown at checkout.</p>
          {returnWindowDays > 0 && <p>Not quite right? Return unused items within {returnWindowDays} days of delivery.</p>}
          <p>
            <Link href="/pages/shipping" className="underline underline-offset-4">
              Shipping policy
            </Link>{" "}
            ·{" "}
            <Link href="/pages/returns" className="underline underline-offset-4">
              Returns policy
            </Link>
          </p>
        </div>
      ),
    },
  ].filter(Boolean) as Array<{ id: string; title: string; body: React.ReactNode }>;

  return (
    <div className="mt-10 border-t border-line">
      {sections.map((section, index) => (
        <details key={section.id} open={index === 0} className="group border-b border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-[0.9375rem] font-medium text-ink-950 [&::-webkit-details-marker]:hidden">
            {section.title}
            <span aria-hidden className="text-xl font-light leading-none text-ink-400 transition-transform duration-200 group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="pb-6">{section.body}</div>
        </details>
      ))}
    </div>
  );
}

async function ProductContent({ params, searchParams }: PageProps<"/p/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [settings, shippingOptions] = await Promise.all([getStoreSettings(), getShippingOptions("US")]);
  const freeShipping = shippingOptions.find((option) => option.freeOverCents !== null)?.freeOverCents ?? null;
  const department = product.category?.parent ?? product.category;
  const reviewPage = Math.max(1, Number.parseInt(typeof query.reviewPage === "string" ? query.reviewPage : "1", 10) || 1);
  const reviewSort = query.reviewSort === "highest" || query.reviewSort === "lowest" ? query.reviewSort : "newest";

  const crumbs = [
    ...(product.category?.parent ? [{ name: product.category.parent.name, href: `/c/${product.category.parent.slug}` }] : []),
    ...(product.category ? [{ name: product.category.name, href: `/c/${product.category.slug}` }] : []),
    { name: product.name, href: `/p/${product.slug}` },
  ];

  return (
    <>
      <JsonLd data={productJsonLd(product, settings.store.currency)} />
      <RecentlyViewedTracker productId={product.id} />
      <div className="container-page pt-4 md:pt-6">
        <Breadcrumbs items={crumbs} />
        <div className="mt-4 grid gap-8 md:mt-6 lg:grid-cols-12 lg:gap-12 xl:gap-16">
          <div className="lg:col-span-7">
            <ProductGallery images={product.images} productName={product.name} />
          </div>
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              {product.brand && (
                <Link href={`/brands/${product.brand.slug}`} className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 hover:text-ink-950">
                  {product.brand.name}
                </Link>
              )}
              <h1 className="mt-2 text-balance text-3xl font-semibold leading-tight tracking-[-0.025em] text-ink-950 md:text-[2.25rem]">{product.name}</h1>
              {product.ratingCount > 0 && (
                <a href="#reviews" className="mt-3 inline-flex hover:underline">
                  <RatingSummary average={product.ratingAverage} count={product.ratingCount} />
                </a>
              )}
              {product.shortDescription && <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-600">{product.shortDescription}</p>}
              <div className="mt-6">
                <PurchasePanel product={product} freeShippingThresholdCents={freeShipping} returnWindowDays={settings.commerce.returnWindowDays} />
              </div>
              <Details product={product} returnWindowDays={settings.commerce.returnWindowDays} />
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <Recommendations product={product} departmentId={department?.id ?? null} />
      </Suspense>

      <Suspense fallback={<div className="container-page py-16"><Skeleton className="h-64" /></div>}>
        <ReviewsSection product={product} page={reviewPage} sort={reviewSort} />
      </Suspense>

      <RecentlyViewedRail excludeId={product.id} />
    </>
  );
}

async function Recommendations({ product, departmentId }: { product: ProductDetail; departmentId: string | null }) {
  const [together, related] = await Promise.all([getBoughtTogether(product.id, departmentId), getRelatedProducts(product.id, product.category?.id ?? null, product.brand?.id ?? null)]);
  const togetherIds = new Set(together.products.map((item) => item.id));
  return (
    <>
      <BoughtTogether
        source={together.source}
        current={{ id: product.id, slug: product.slug, name: product.name, priceCents: product.priceCents, images: product.images, quickAddVariantId: null, brand: product.brand }}
        products={together.products}
      />
      <ProductRail title="You may also like" products={related.filter((item) => !togetherIds.has(item.id))} className="border-t border-line" />
    </>
  );
}

export default function ProductPage(props: PageProps<"/p/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="container-page pt-6">
          <Skeleton className="h-4 w-56" />
          <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-12">
            <Skeleton className="aspect-[4/5] rounded-lg lg:col-span-7" />
            <div className="space-y-4 lg:col-span-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="mt-8 h-12 w-full" />
            </div>
          </div>
        </div>
      }
    >
      <ProductContent {...props} />
    </Suspense>
  );
}
