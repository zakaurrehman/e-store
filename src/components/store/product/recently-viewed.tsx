"use client";

import { useEffect, useState } from "react";
import { getProductCardsAction, trackProductViewAction } from "@/features/catalog/actions";
import type { ProductCardData } from "@/features/catalog/queries";
import { ProductCard } from "./product-card";

const KEY = "veyora:recently-viewed";

function read(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function RecentlyViewedTracker({ productId }: { productId: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([productId, ...read().filter((id) => id !== productId)].slice(0, 12)));
    } catch {
      // storage unavailable — non-essential
    }
    void trackProductViewAction(productId);
  }, [productId]);
  return null;
}

export function RecentlyViewedRail({ excludeId, title = "Recently viewed" }: { excludeId?: string; title?: string }) {
  const [products, setProducts] = useState<ProductCardData[]>([]);
  useEffect(() => {
    const ids = read().filter((id) => id !== excludeId).slice(0, 8);
    if (ids.length === 0) return;
    let active = true;
    getProductCardsAction(ids).then((cards) => {
      if (active) setProducts(cards);
    });
    return () => {
      active = false;
    };
  }, [excludeId]);

  if (products.length === 0) return null;
  return (
    <section aria-label={title} className="border-t border-line py-12 md:py-16">
      <div className="container-page">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-[1.75rem]">{title}</h2>
        <ul className="scrollbar-none -mx-4 mt-7 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:gap-5 md:-mx-8 md:px-8 xl:mx-0 xl:grid xl:grid-cols-6 xl:px-0">
          {products.map((product) => (
            <li key={product.id} className="w-[38vw] shrink-0 snap-start sm:w-[26vw] md:w-[20vw] xl:w-auto">
              <ProductCard product={product} sizes="(min-width: 1280px) 15vw, 38vw" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
