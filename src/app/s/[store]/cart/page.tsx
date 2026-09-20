import type { Metadata } from "next";
import { CartPageView } from "@/components/store/cart/cart-page";
import { RecentlyViewedRail } from "@/components/store/product/recently-viewed";

export const metadata: Metadata = { title: "Your bag", robots: { index: false, follow: true } };

export default function CartPage() {
  return (
    <>
      <div className="container-page pb-16 pt-8 md:pt-12">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink-950 md:text-4xl">Your bag</h1>
        <div className="mt-8">
          <CartPageView />
        </div>
      </div>
      <RecentlyViewedRail title="Recently viewed" />
    </>
  );
}
