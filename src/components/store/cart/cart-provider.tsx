"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  addToCartAction,
  applyCouponAction,
  removeCartLineAction,
  removeCouponAction,
  updateCartLineAction,
  type CartActionResult,
} from "@/features/cart/actions";
import { EMPTY_CART, type CartSnapshot } from "@/features/cart/types";
import { useToast } from "@/components/ui/toast";

type CartContextValue = {
  cart: CartSnapshot;
  ready: boolean;
  pending: boolean;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  hydrate: (snapshot: CartSnapshot) => void;
  addItem: (variantId: string, quantity: number, options?: { openDrawer?: boolean }) => Promise<boolean>;
  updateLine: (itemId: string, quantity: number) => Promise<void>;
  removeLine: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<CartActionResult>;
  removeCoupon: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartSnapshot>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const version = useRef(0);

  const hydrate = useCallback((snapshot: CartSnapshot) => {
    setCart(snapshot);
    setReady(true);
  }, []);
  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  const run = useCallback(
    (action: () => Promise<CartActionResult>, onDone?: (result: CartActionResult) => void) =>
      new Promise<CartActionResult>((resolve) => {
        const requestVersion = ++version.current;
        startTransition(async () => {
          const result = await action();
          // Ignore stale responses when the customer clicks faster than the network.
          if (requestVersion === version.current) setCart(result.cart);
          setReady(true);
          if (!result.ok) toast({ title: result.error, tone: "error" });
          onDone?.(result);
          resolve(result);
        });
      }),
    [toast],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      ready,
      pending,
      isOpen,
      openCart,
      closeCart,
      hydrate,
      addItem: async (variantId, quantity, options) => {
        const result = await run(() => addToCartAction({ variantId, quantity }));
        if (result.ok && options?.openDrawer !== false) setOpen(true);
        return result.ok;
      },
      updateLine: async (itemId, quantity) => {
        await run(() => updateCartLineAction({ itemId, quantity }));
      },
      removeLine: async (itemId) => {
        await run(() => removeCartLineAction({ itemId }));
      },
      applyCoupon: (code) => run(() => applyCouponAction({ code })),
      removeCoupon: async () => {
        await run(() => removeCouponAction());
      },
    }),
    [cart, ready, pending, isOpen, hydrate, run, openCart, closeCart],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart() {
  const context = use(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}

/** Rendered by the server with the visitor's cart so the client state is correct without an extra request. */
export function CartHydrator({ snapshot }: { snapshot: CartSnapshot }) {
  const { hydrate } = useCart();
  useEffect(() => {
    hydrate(snapshot);
  }, [hydrate, snapshot]);
  return null;
}
