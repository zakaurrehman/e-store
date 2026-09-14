import { Suspense } from "react";
import { CartBootstrap } from "@/components/store/cart/cart-bootstrap";
import { CartDrawer } from "@/components/store/cart/cart-drawer";
import { CartProvider } from "@/components/store/cart/cart-provider";
import { SiteFooter } from "@/components/store/footer/site-footer";
import { AnnouncementBar, SiteHeader } from "@/components/store/header/site-header";
import { MobileTabBar } from "@/components/store/mobile-tab-bar";
import { SearchDialog } from "@/components/store/search/search-dialog";
import { WishlistBootstrap } from "@/components/store/wishlist/wishlist-bootstrap";
import { WishlistProvider } from "@/components/store/wishlist/wishlist-provider";

export default function StoreLayout({ children }: LayoutProps<"/">) {
  return (
    <CartProvider>
    <WishlistProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-ink-950 px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      {/* Leaves that react to the current URL stream in, keeping the shell prerenderable on dynamic routes. */}
      <Suspense fallback={null}>
        <MobileTabBar />
      </Suspense>
      <Suspense fallback={null}>
        <SearchDialog />
      </Suspense>
      <Suspense fallback={null}>
        <CartDrawer />
      </Suspense>
      <Suspense>
        <CartBootstrap />
      </Suspense>
      <Suspense>
        <WishlistBootstrap />
      </Suspense>
    </WishlistProvider>
    </CartProvider>
  );
}
