"use client";

import { Check, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { QuantityInput } from "@/components/ui/quantity-input";
import type { ProductDetail } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";
import { useCart } from "../cart/cart-provider";
import { WishlistButton } from "./product-card-actions";
import { GALLERY_SELECT_EVENT } from "./gallery";

type Props = {
  product: Pick<ProductDetail, "id" | "name" | "priceCents" | "maxPriceCents" | "compareAtPriceCents" | "variants" | "optionGroups" | "inStock">;
  freeShippingThresholdCents: number | null;
  returnWindowDays: number;
};

export function PurchasePanel({ product, freeShippingThresholdCents, returnWindowDays }: Props) {
  const { addItem, pending } = useCart();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const buttonsRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const fromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("variant") : null;
    const urlVariant = product.variants.find((variant) => variant.id === fromUrl);
    for (const group of product.optionGroups) {
      const values = group.values.map((value) => value.id);
      const match = urlVariant?.optionValueIds.find((id) => values.includes(id));
      if (match) initial[group.attributeId] = match;
      else if (group.values.length === 1) initial[group.attributeId] = group.values[0].id;
      else if (group.slug === "volume" || group.slug === "case-size") {
        const firstAvailable = group.values.find((value) => product.variants.some((variant) => variant.available && variant.optionValueIds.includes(value.id)));
        if (firstAvailable) initial[group.attributeId] = firstAvailable.id;
      }
    }
    return initial;
  });

  const single = product.optionGroups.length === 0;
  const variant = useMemo(() => {
    if (single) return product.variants[0] ?? null;
    if (product.optionGroups.some((group) => !selected[group.attributeId])) return null;
    const chosen = Object.values(selected);
    return product.variants.find((candidate) => chosen.every((id) => candidate.optionValueIds.includes(id))) ?? null;
  }, [product.variants, product.optionGroups, selected, single]);

  useEffect(() => {
    if (!variant || single) return;
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant.id);
    window.history.replaceState(window.history.state, "", url);
    if (variant.imageId) window.dispatchEvent(new CustomEvent(GALLERY_SELECT_EVENT, { detail: variant.imageId }));
  }, [variant, single]);

  useEffect(() => {
    const el = buttonsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setShowStickyBar(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const effective = variant ? (variant.salePriceCents !== null && variant.salePriceCents < variant.priceCents ? variant.salePriceCents : variant.priceCents) : product.priceCents;
  const compareAt = variant ? (variant.salePriceCents !== null && variant.salePriceCents < variant.priceCents ? variant.priceCents : null) : product.compareAtPriceCents;
  const maxQuantity = variant?.stockQuantity !== null && variant?.stockQuantity !== undefined ? Math.max(1, Math.min(20, variant.stockQuantity)) : 20;

  const isValueAvailable = (attributeId: string, valueId: string) => {
    const others = Object.entries(selected).filter(([key]) => key !== attributeId).map(([, id]) => id);
    return product.variants.some((candidate) => candidate.available && candidate.optionValueIds.includes(valueId) && others.every((id) => candidate.optionValueIds.includes(id)));
  };

  const stockLabel = (() => {
    if (!variant) return null;
    if (!variant.available) return { tone: "danger", text: "Sold out" };
    if (variant.stockQuantity !== null && variant.stockQuantity <= variant.lowStockThreshold) return { tone: "warning", text: `Only ${variant.stockQuantity} left` };
    return { tone: "success", text: "In stock — ready to ship" };
  })();

  const missingGroup = product.optionGroups.find((group) => !selected[group.attributeId]);

  const add = async (thenCheckout: boolean) => {
    setError(null);
    if (!variant) {
      setError(missingGroup ? `Please select a ${missingGroup.name.toLowerCase()}.` : "This combination isn't available.");
      return;
    }
    if (!variant.available) {
      setError("This option is sold out.");
      return;
    }
    const ok = await addItem(variant.id, quantity, { openDrawer: !thenCheckout });
    if (ok) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2200);
      if (thenCheckout) router.push("/checkout");
    }
  };

  const soldOut = product.variants.length > 0 && product.variants.every((candidate) => !candidate.available);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Price cents={effective} compareAtCents={compareAt} size="xl" showDiscount from={!variant && product.maxPriceCents > product.priceCents} />
      </div>
      <p className="mt-1 text-[0.8125rem] text-ink-500">Tax calculated at checkout.</p>

      {product.optionGroups.map((group) => {
        const current = group.values.find((value) => value.id === selected[group.attributeId]);
        return (
          <fieldset key={group.attributeId} className="mt-7">
            <legend className="flex w-full items-center justify-between text-sm">
              <span className="font-medium text-ink-950">
                {group.name}
                {current && <span className="ml-1.5 font-normal text-ink-600">{current.value}</span>}
              </span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {group.values.map((value) => {
                const available = isValueAvailable(group.attributeId, value.id);
                const active = selected[group.attributeId] === value.id;
                return (
                  <label
                    key={value.id}
                    className={cn(
                      "relative flex h-11 min-w-12 cursor-pointer select-none items-center justify-center rounded-sm border px-3.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-iris-500",
                      active ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong text-ink-950 hover:border-ink-950",
                      !available && !active && "text-ink-400 [background:linear-gradient(to_top_left,transparent_calc(50%-0.5px),var(--color-line-strong)_50%,transparent_calc(50%+0.5px))]",
                    )}
                  >
                    <input
                      type="radio"
                      name={group.slug}
                      value={value.id}
                      checked={active}
                      onChange={() => {
                        setSelected((prev) => ({ ...prev, [group.attributeId]: value.id }));
                        setError(null);
                      }}
                      className="sr-only"
                    />
                    {value.value}
                    {!available && <span className="sr-only"> (sold out)</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="mt-6 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
        {stockLabel && (
          <span className={cn("inline-flex items-center gap-1.5 font-medium", stockLabel.tone === "success" && "text-success", stockLabel.tone === "warning" && "text-warning", stockLabel.tone === "danger" && "text-danger")}>
            <span className={cn("size-1.5 rounded-full", stockLabel.tone === "success" && "bg-success", stockLabel.tone === "warning" && "bg-warning", stockLabel.tone === "danger" && "bg-danger")} />
            {stockLabel.text}
          </span>
        )}
        {!stockLabel && soldOut && <span className="font-medium text-danger">Sold out</span>}
        {variant?.sku && <span className="text-ink-500">SKU {variant.sku}</span>}
      </div>

      <div ref={buttonsRef} className="mt-4 flex flex-wrap items-stretch gap-3">
        <QuantityInput value={quantity} onChange={setQuantity} max={maxQuantity} disabled={soldOut || (!!variant && !variant.available)} label="Quantity" />
        <Button size="lg" className="min-w-0 flex-1" onClick={() => add(false)} loading={pending} disabled={soldOut}>
          {added ? (
            <>
              <Check className="size-4" /> Added
            </>
          ) : soldOut ? (
            "Sold out"
          ) : (
            "Add to bag"
          )}
        </Button>
        <WishlistButton productId={product.id} productName={product.name} className="size-13 rounded-sm shadow-none ring-1 ring-line-strong" />
      </div>
      {!soldOut && (
        <Button variant="secondary" size="lg" fullWidth className="mt-3" onClick={() => add(true)} disabled={pending}>
          Buy now
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="mt-8 space-y-3 border-t border-line pt-6 text-[0.875rem] text-ink-700">
        <li className="flex gap-3">
          <Truck className="mt-0.5 size-4 shrink-0 text-ink-950" strokeWidth={1.6} aria-hidden />
          <span>{freeShippingThresholdCents ? `Complimentary US standard shipping on orders over ${formatMoney(freeShippingThresholdCents)}` : "Tracked shipping worldwide"}</span>
        </li>
        {returnWindowDays > 0 && (
          <li className="flex gap-3">
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-ink-950" strokeWidth={1.6} aria-hidden />
            <span>Free returns within {returnWindowDays} days</span>
          </li>
        )}
        <li className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-950" strokeWidth={1.6} aria-hidden />
          <span>Secure checkout — orders confirmed only after verified payment</span>
        </li>
      </ul>

      {/* Sticky purchase bar once the main buttons scroll out of view */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md transition-transform duration-300",
          showStickyBar && !soldOut ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={!showStickyBar}
      >
        <div className="container-page flex h-16 items-center gap-4">
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="truncate text-sm font-medium text-ink-950">{product.name}</p>
            <p className="text-[0.8125rem] text-ink-500">{variant && !single ? variant.title : missingGroup ? `Select ${missingGroup.name.toLowerCase()}` : ""}</p>
          </div>
          <Price cents={effective} compareAtCents={compareAt} size="md" className="shrink-0" />
          <Button
            className="ml-auto flex-1 sm:flex-none sm:px-10"
            tabIndex={showStickyBar ? 0 : -1}
            loading={pending}
            onClick={() => {
              if (!variant) {
                buttonsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                setError(missingGroup ? `Please select a ${missingGroup.name.toLowerCase()}.` : "This combination isn't available.");
                return;
              }
              void add(false);
            }}
          >
            Add to bag
          </Button>
        </div>
      </div>
    </div>
  );
}
