import type { Metadata } from "next";
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
import { SupportWidget } from "@/components/support/support-widget";
import { storeFromParams } from "@/features/stores/route";

/**
 * Every storefront renders here: the proxy rewrites <slug>.zendropship.io/… to /s/<slug>/…, so the store arrives as a
 * route param. Store data is cached per store; the header and footer stream in behind a same-size placeholder.
 */
export async function generateMetadata({ params }: LayoutProps<"/s/[store]">): Promise<Metadata> {
  const store = await storeFromParams(params);
  return {
    metadataBase: new URL(store.url),
    title: { default: store.name, template: `%s · ${store.name}` },
    description: store.tagline ?? undefined,
    applicationName: store.name,
    openGraph: { siteName: store.name },
  };
}

/** The store's accent colour overrides the brand accent tokens (validated as #rrggbb when saved). */
function accentStyles(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || hex.toLowerCase() === "#5446ff") return null;
  return `:root{--color-iris-500:${hex};--color-iris-600:color-mix(in oklab,${hex} 88%,black);--color-iris-700:color-mix(in oklab,${hex} 72%,black);--color-iris-100:color-mix(in oklab,${hex} 16%,white);--color-iris-50:color-mix(in oklab,${hex} 7%,white)}`;
}

async function StoreHeader({ params }: { params: Promise<{ store: string }> }) {
  const store = await storeFromParams(params);
  const styles = accentStyles(store.accentColor);
  return (
    <>
      {styles && <style>{styles}</style>}
      <AnnouncementBar store={store} />
      <SiteHeader store={store} />
    </>
  );
}

async function StoreFooter({ params }: { params: Promise<{ store: string }> }) {
  return <SiteFooter store={await storeFromParams(params)} />;
}

async function StoreSupportWidget({ params }: { params: Promise<{ store: string }> }) {
  return <SupportWidget store={await storeFromParams(params)} />;
}

export default function StoreLayout({ children, params }: LayoutProps<"/s/[store]">) {
  const storeId = storeFromParams(params).then((store) => store.id);
  return (
    <CartProvider>
      <WishlistProvider>
        <a
          href="#main"
          className="sr-only z-50 rounded-sm bg-ink-950 px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Suspense fallback={<div className="h-16 border-b border-line lg:h-[4.5rem]" />}>
          <StoreHeader params={params} />
        </Suspense>
        <main id="main" className="min-h-[60vh]">
          {children}
        </main>
        <Suspense fallback={null}>
          <StoreFooter params={params} />
        </Suspense>
        {/* Leaves that react to the current URL stream in, keeping the shell prerenderable on dynamic routes. */}
        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
        <Suspense fallback={null}>
          <SearchDialog />
        </Suspense>
        <Suspense fallback={null}>
          <StoreSupportWidget params={params} />
        </Suspense>
        <Suspense fallback={null}>
          <CartDrawer />
        </Suspense>
        <Suspense>
          <CartBootstrap storeId={storeId} />
        </Suspense>
        <Suspense>
          <WishlistBootstrap />
        </Suspense>
      </WishlistProvider>
    </CartProvider>
  );
}
