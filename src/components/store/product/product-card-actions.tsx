"use client";

import { Heart, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { useCart } from "../cart/cart-provider";
import { useWishlist } from "../wishlist/wishlist-provider";

export function WishlistButton({ productId, productName, className, size = "md" }: { productId: string; productName: string; className?: string; size?: "sm" | "md" }) {
  const { has, toggle } = useWishlist();
  const saved = has(productId);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle(productId, productName);
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-surface/90 text-ink-950 shadow-hairline backdrop-blur transition-[transform,background-color] hover:scale-105 hover:bg-surface active:scale-95",
        size === "sm" ? "size-8" : "size-9",
        className,
      )}
    >
      <Heart className={cn(size === "sm" ? "size-4" : "size-[1.05rem]", saved && "fill-sale text-sale")} strokeWidth={1.8} />
    </button>
  );
}

export function QuickAddButton({ variantId, productName, className }: { variantId: string; productName: string; className?: string }) {
  const { addItem } = useCart();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setBusy(true);
        await addItem(variantId, 1);
        setBusy(false);
      }}
      aria-label={`Add ${productName} to bag`}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm bg-surface/95 px-3 text-[0.8125rem] font-medium text-ink-950 shadow-hairline backdrop-blur transition-colors hover:bg-ink-950 hover:text-white disabled:opacity-60",
        className,
      )}
    >
      <Plus className="size-3.5" strokeWidth={2.2} aria-hidden />
      {busy ? "Adding…" : "Add to bag"}
    </button>
  );
}
