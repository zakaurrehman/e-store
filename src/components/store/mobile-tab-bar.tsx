"use client";

import { Home, LayoutGrid, Search, ShoppingBag, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/utils/cn";
import { useCart } from "./cart/cart-provider";
import { OPEN_MOBILE_MENU_EVENT } from "./header/mobile-menu";
import { OPEN_SEARCH_EVENT } from "./search/search-dialog";

/** App-style bottom navigation on phones. Hidden where a page has its own sticky action bar. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { cart, openCart } = useCart();
  if (pathname.startsWith("/p/") || pathname.startsWith("/checkout") || pathname === "/cart") return null;

  const item = "flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-[0.625rem] font-medium tracking-[0.02em]";
  return (
    <>
      <div className="h-[calc(3.75rem+env(safe-area-inset-bottom))] md:hidden" aria-hidden />
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <Link href="/" className={cn(item, pathname === "/" ? "text-ink-950" : "text-ink-500")} aria-current={pathname === "/" ? "page" : undefined}>
          <Home className="size-5" strokeWidth={1.6} />
          Home
        </Link>
        <button type="button" className={cn(item, "text-ink-500")} onClick={() => window.dispatchEvent(new Event(OPEN_MOBILE_MENU_EVENT))}>
          <LayoutGrid className="size-5" strokeWidth={1.6} />
          Shop
        </button>
        <button type="button" className={cn(item, "text-ink-500")} onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
          <Search className="size-5" strokeWidth={1.6} />
          Search
        </button>
        <button type="button" className={cn(item, "relative text-ink-500")} onClick={openCart}>
          <span className="relative">
            <ShoppingBag className="size-5" strokeWidth={1.6} />
            {cart.itemCount > 0 && (
              <span className="tabular absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-950 px-1 text-[0.5625rem] font-semibold text-white">
                {cart.itemCount}
              </span>
            )}
          </span>
          Bag
        </button>
        <Link href="/account" className={cn(item, pathname.startsWith("/account") ? "text-ink-950" : "text-ink-500")}>
          <User className="size-5" strokeWidth={1.6} />
          Account
        </Link>
      </nav>
    </>
  );
}
