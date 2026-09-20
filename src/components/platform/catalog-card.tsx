import Image from "next/image";
import Link from "next/link";
import type { ProductCardData } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";
import { AddToStoreButton } from "./add-to-store-button";

/** What an owner keeps per unit at the suggested price, before payment-processing fees. */
export function marginAt(retailCents: number, costCents: number) {
  const cents = Math.max(0, retailCents - costCents);
  return { cents, percent: retailCents > 0 ? Math.round((cents / retailCents) * 100) : 0 };
}

/**
 * Platform catalogue card for prospective and current store owners: the product, what it costs them,
 * what it sells for, and one tap to put it in their store.
 */
export function CatalogCard({ product, inStore, signedIn, priority = false }: { product: ProductCardData; inStore: boolean; signedIn: boolean; priority?: boolean }) {
  const image = product.images[0];
  const margin = marginAt(product.priceCents, product.costCents);
  const href = `/catalog/p/${product.slug}`;
  return (
    <article className="group relative flex h-full flex-col rounded-md">
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-canvas">
        {image && (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
            preload={priority}
            loading={priority ? "eager" : "lazy"}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        )}
        {!product.inStock && <span className="absolute left-2.5 top-2.5 rounded-xs bg-ink-950/85 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-white">Out of stock</span>}
        {product.inStock && margin.percent > 0 && (
          <span className="absolute left-2.5 top-2.5 rounded-xs bg-surface/95 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-success">{margin.percent}% margin</span>
        )}
      </div>
      <div className="flex flex-1 flex-col pt-3">
        {product.brand && <p className="truncate text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">{product.brand.name}</p>}
        <h3 className="mt-1 line-clamp-2 text-[0.9375rem] leading-snug text-ink-950">
          <Link href={href} className="after:absolute after:inset-x-0 after:top-0 after:aspect-[4/5] focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        <dl className="tabular mt-2 grid grid-cols-3 gap-2 rounded-sm bg-canvas px-2.5 py-2 text-[0.75rem]">
          <div>
            <dt className="text-ink-500">You pay</dt>
            <dd className="font-medium text-ink-950">{formatMoney(product.costCents)}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Sells for</dt>
            <dd className="font-medium text-ink-950">
              {product.maxPriceCents > product.priceCents && <span className="text-ink-500">from </span>}
              {formatMoney(product.priceCents)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">You earn</dt>
            <dd className={cn("font-medium", margin.cents > 0 ? "text-success" : "text-ink-950")}>{formatMoney(margin.cents)}</dd>
          </div>
        </dl>
        <div className="relative z-10 mt-3">
          <AddToStoreButton productId={product.id} productName={product.name} inStore={inStore} signedIn={signedIn} fullWidth />
        </div>
      </div>
    </article>
  );
}

export function CatalogGrid({ products, inStoreIds, signedIn, priorityCount = 0, className }: { products: ProductCardData[]; inStoreIds: string[]; signedIn: boolean; priorityCount?: number; className?: string }) {
  const owned = new Set(inStoreIds);
  return (
    <ul className={cn("grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((product, index) => (
        <li key={product.id}>
          <CatalogCard product={product} inStore={owned.has(product.id)} signedIn={signedIn} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
