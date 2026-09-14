"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProductCardData } from "@/features/catalog/queries";
import { formatMoney } from "@/utils/money";
import { useCart } from "../cart/cart-provider";

type Item = Pick<ProductCardData, "id" | "slug" | "name" | "priceCents" | "images" | "quickAddVariantId" | "brand">;

/** "Frequently bought together" (real co-purchase data) or "Pairs well with" (curated fallback). */
export function BoughtTogether({ source, current, products }: { source: "orders" | "curated"; current: Item; products: Item[] }) {
  const { addItem, pending, openCart } = useCart();
  const quickAddable = products.filter((product) => product.quickAddVariantId);
  const [selected, setSelected] = useState<Set<string>>(new Set(quickAddable.map((product) => product.id)));
  if (products.length === 0) return null;

  const title = source === "orders" ? "Frequently bought together" : "Pairs well with";
  const total = quickAddable.filter((product) => selected.has(product.id)).reduce((sum, product) => sum + product.priceCents, 0);

  return (
    <section aria-label={title} className="border-t border-line py-12 md:py-16">
      <div className="container-page grid gap-8 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-[1.75rem]">{title}</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-600">{source === "orders" ? `Customers who bought ${current.name} also chose these.` : `Complete the look with pieces chosen to go with ${current.name}.`}</p>
          {quickAddable.length > 0 && (
            <div className="mt-6">
              <p className="tabular text-sm text-ink-600">
                Selected items: <span className="font-semibold text-ink-950">{formatMoney(total)}</span>
              </p>
              <Button
                className="mt-3"
                disabled={pending || total === 0}
                onClick={async () => {
                  for (const product of quickAddable) {
                    if (selected.has(product.id) && product.quickAddVariantId) await addItem(product.quickAddVariantId, 1, { openDrawer: false });
                  }
                  openCart();
                }}
              >
                Add selected to bag
              </Button>
            </div>
          )}
        </div>
        <ul className="grid grid-cols-3 gap-3 sm:gap-5 lg:col-span-8">
          {products.map((product) => (
            <li key={product.id}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-canvas">
                {product.images[0] && <Image src={product.images[0].url} alt={product.images[0].alt} fill sizes="(min-width: 1024px) 20vw, 30vw" className="object-cover" />}
                {product.quickAddVariantId && (
                  <label className="absolute left-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-surface/95 shadow-hairline">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(product.id)) next.delete(product.id);
                          else next.add(product.id);
                          return next;
                        })
                      }
                      className="size-4 accent-ink-950"
                      aria-label={`Include ${product.name}`}
                    />
                  </label>
                )}
              </div>
              {product.brand && <p className="mt-2.5 truncate text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">{product.brand.name}</p>}
              <Link href={`/p/${product.slug}`} className="mt-0.5 line-clamp-2 text-sm text-ink-950 hover:underline">
                {product.name}
              </Link>
              <p className="tabular mt-1 text-sm font-medium">{formatMoney(product.priceCents)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
