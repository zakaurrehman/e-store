"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toggleWishlistAction } from "@/features/wishlist/actions";
import { useToast } from "@/components/ui/toast";

type WishlistContextValue = {
  has: (productId: string) => boolean;
  toggle: (productId: string, productName?: string) => Promise<void>;
  hydrate: (ids: string[], signedIn: boolean) => void;
  count: number;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const hydrate = useCallback((next: string[], isSignedIn: boolean) => {
    setIds(new Set(next));
    setSignedIn(isSignedIn);
  }, []);

  const toggle = useCallback(
    async (productId: string, productName?: string) => {
      // Read the URL at click time (keeps this provider free of runtime URL hooks).
      const here = `${window.location.pathname}${window.location.search}`;
      if (!signedIn) {
        router.push(`/login?next=${encodeURIComponent(here)}`);
        return;
      }
      const desired = !ids.has(productId);
      setIds((current) => {
        const next = new Set(current);
        if (desired) next.add(productId);
        else next.delete(productId);
        return next;
      });
      const result = await toggleWishlistAction({ productId, desired });
      if (!result.ok) {
        setIds((current) => {
          const next = new Set(current);
          if (desired) next.delete(productId);
          else next.add(productId);
          return next;
        });
        if (result.requiresAuth) router.push(`/login?next=${encodeURIComponent(here)}`);
        else toast({ title: result.error, tone: "error" });
        return;
      }
      toast({ title: desired ? `Saved${productName ? ` ${productName}` : ""} to your wishlist` : "Removed from your wishlist", tone: "info", durationMs: 2500 });
    },
    [ids, signedIn, router, toast],
  );

  const value = useMemo(() => ({ has: (id: string) => ids.has(id), toggle, hydrate, count: ids.size }), [ids, toggle, hydrate]);
  return <WishlistContext value={value}>{children}</WishlistContext>;
}

export function useWishlist() {
  const context = use(WishlistContext);
  if (!context) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return context;
}

export function WishlistHydrator({ ids, signedIn }: { ids: string[]; signedIn: boolean }) {
  const { hydrate } = useWishlist();
  useEffect(() => hydrate(ids, signedIn), [hydrate, ids, signedIn]);
  return null;
}
