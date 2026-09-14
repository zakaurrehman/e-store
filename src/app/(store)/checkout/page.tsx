import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { CheckoutForm, type SavedAddress } from "@/components/store/checkout/checkout-form";
import { Skeleton } from "@/components/ui/misc";
import { getCurrentCart } from "@/features/cart/session";
import { buildCartSnapshot } from "@/features/cart/snapshot";
import { getShippableCountries } from "@/features/checkout/shipping";
import { getStoreSettings } from "@/features/settings/queries";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

async function CheckoutContent() {
  const [user, cart, settings, countries] = await Promise.all([getCurrentUser(), getCurrentCart(), getStoreSettings(), getShippableCountries()]);
  if (!cart || cart.lines.length === 0) redirect("/cart");
  if (cart.hasUnavailableItems) redirect("/cart");
  if (!user && !settings.commerce.guestCheckout) redirect("/login?next=/checkout");

  const snapshot = await buildCartSnapshot(cart, { userId: user?.id ?? null, email: user?.email ?? null });
  const savedAddresses: SavedAddress[] = user
    ? (await db.address.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ isDefaultShipping: "desc" }, { createdAt: "asc" }] })).map((address) => ({
        id: address.id,
        label: address.label,
        isDefaultShipping: address.isDefaultShipping,
        firstName: address.firstName,
        lastName: address.lastName,
        company: address.company,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
        phone: address.phone,
      }))
    : [];
  const customer = user ? await db.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, firstName: true, lastName: true, phone: true } }) : null;

  return <CheckoutForm cart={snapshot} customer={customer} savedAddresses={savedAddresses} shippableCountries={countries} guestCheckoutEnabled={settings.commerce.guestCheckout} />;
}

export default function CheckoutPage() {
  return (
    <div className="container-page pb-20 pt-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] md:text-4xl">Checkout</h1>
        <Link href="/" className="hidden sm:block" aria-label="Veyora home">
          <Logo />
        </Link>
      </div>
      <Suspense
        fallback={
          <div className="lg:grid lg:grid-cols-12 lg:gap-16" aria-busy>
            <div className="space-y-6 lg:col-span-7">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="hidden h-96 lg:col-span-5 lg:block" />
          </div>
        }
      >
        <CheckoutContent />
      </Suspense>
    </div>
  );
}
