"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "../cart/cart-provider";

export function BagButton({ className }: { className?: string }) {
  const { cart, openCart } = useCart();
  const count = cart.itemCount;
  return (
    <button type="button" onClick={openCart} className={`relative ${className ?? ""}`} aria-label={`Open bag, ${count} item${count === 1 ? "" : "s"}`}>
      <ShoppingBag className="size-5" strokeWidth={1.6} />
      {count > 0 && (
        <span className="tabular absolute right-0.5 top-0.5 flex h-4 min-w-4 animate-fade-in items-center justify-center rounded-full bg-ink-950 px-1 text-[0.625rem] font-semibold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
