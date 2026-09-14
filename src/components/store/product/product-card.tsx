import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/ui/price";
import { RatingSummary } from "@/components/ui/rating";
import type { ProductCardData } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";
import { discountPercent } from "@/utils/money";
import { QuickAddButton, WishlistButton } from "./product-card-actions";

type ProductCardProps = {
  product: ProductCardData;
  layout?: "grid" | "list";
  /** Mark the first row of a listing as high priority for LCP. */
  priority?: boolean;
  sizes?: string;
};

export function ProductCard({ product, layout = "grid", priority = false, sizes = "(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw" }: ProductCardProps) {
  const [primary, secondary] = product.images;
  const percent = product.compareAtPriceCents ? discountPercent(product.compareAtPriceCents, product.priceCents) : 0;
  const href = `/p/${product.slug}`;

  const badges = (
    <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
      {!product.inStock && <span className="rounded-xs bg-ink-950/85 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-white">Sold out</span>}
      {product.inStock && percent > 0 && <span className="rounded-xs bg-sale px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-white">−{percent}%</span>}
      {product.inStock && product.isNew && percent === 0 && <span className="rounded-xs bg-surface/95 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-950">New</span>}
    </div>
  );

  const media = (
    <div className={cn("relative overflow-hidden rounded-md bg-canvas", layout === "list" ? "aspect-[4/5] w-28 shrink-0 sm:w-40" : "aspect-[4/5]")}>
      {primary ? (
        <Image
          src={primary.url}
          alt={primary.alt}
          fill
          sizes={layout === "list" ? "160px" : sizes}
          preload={priority}
          loading={priority ? "eager" : "lazy"}
          className={cn("object-cover transition-[opacity,transform] duration-700 ease-out", secondary && "group-hover:opacity-0", !secondary && "group-hover:scale-[1.03]")}
        />
      ) : null}
      {secondary && (
        <Image src={secondary.url} alt="" fill sizes={layout === "list" ? "160px" : sizes} className="scale-[1.02] object-cover opacity-0 transition-[opacity,transform] duration-700 ease-out group-hover:scale-100 group-hover:opacity-100" aria-hidden />
      )}
      {!product.inStock && <div className="absolute inset-0 bg-surface/25" aria-hidden />}
      {badges}
    </div>
  );

  const details = (
    <div className={cn("min-w-0", layout === "grid" ? "pt-3" : "flex flex-1 flex-col py-1")}>
      {product.brand && <p className="truncate text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">{product.brand.name}</p>}
      <h3 className={cn("mt-1 line-clamp-2 text-[0.9375rem] leading-snug text-ink-950", layout === "list" && "text-base font-medium")}>
        <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
          {product.name}
        </Link>
      </h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Price cents={product.priceCents} compareAtCents={product.compareAtPriceCents} from={product.maxPriceCents > product.priceCents} size="sm" />
        {product.ratingCount > 0 && <RatingSummary average={product.ratingAverage} count={product.ratingCount} />}
      </div>
      {layout === "list" && (
        <div className="relative z-10 mt-auto flex items-center gap-2 pt-4">
          {product.quickAddVariantId && product.inStock ? (
            <QuickAddButton variantId={product.quickAddVariantId} productName={product.name} className="border border-line-strong shadow-none" />
          ) : (
            <Link href={href} className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-[0.8125rem] font-medium hover:border-ink-950">
              {product.inStock ? "Choose options" : "View details"}
            </Link>
          )}
        </div>
      )}
    </div>
  );

  if (layout === "list") {
    return (
      <article className="group relative flex gap-4 rounded-md focus-within:ring-2 focus-within:ring-iris-500 sm:gap-6">
        {media}
        {details}
        <div className="absolute left-[5.5rem] top-2 z-10 sm:left-[8.25rem]">
          <WishlistButton productId={product.id} productName={product.name} size="sm" />
        </div>
      </article>
    );
  }

  return (
    <article className="group relative rounded-md focus-within:ring-2 focus-within:ring-iris-500 focus-within:ring-offset-4">
      <div className="relative">
        {media}
        <div className="absolute right-2.5 top-2.5 z-10">
          <WishlistButton productId={product.id} productName={product.name} />
        </div>
        {product.inStock && product.quickAddVariantId && (
          <div className="absolute bottom-2.5 right-2.5 z-10 hidden translate-y-1 opacity-0 transition-[opacity,transform] duration-300 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 md:block">
            <QuickAddButton variantId={product.quickAddVariantId} productName={product.name} />
          </div>
        )}
      </div>
      {details}
    </article>
  );
}

export function ProductGrid({ products, layout = "grid", priorityCount = 0, className }: { products: ProductCardData[]; layout?: "grid" | "list"; priorityCount?: number; className?: string }) {
  if (layout === "list") {
    return (
      <ul className={cn("divide-y divide-line", className)}>
        {products.map((product, index) => (
          <li key={product.id} className="py-5 first:pt-0">
            <ProductCard product={product} layout="list" priority={index < priorityCount} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={cn("grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
