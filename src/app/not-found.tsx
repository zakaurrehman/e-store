import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentStore } from "@/features/stores/current";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * Where to go next depends on which site the visitor is on. A storefront has a shop and a search; the
 * platform site has the catalogue and a way to reach us; and a subdomain whose store does not exist (or
 * was closed) has neither, so those links leave for the platform. Offering the wrong set is how one 404
 * leads to the next.
 */
async function WaysOut() {
  const store = await getCurrentStore();
  if (store) {
    return (
      <>
        <ButtonLink href="/">Back to home</ButtonLink>
        <ButtonLink href="/shop" variant="secondary">
          Shop everything
        </ButtonLink>
        <ButtonLink href="/search" variant="secondary">
          Search
        </ButtonLink>
      </>
    );
  }
  // No store for this host: either the platform site, or an address that never belonged to a live store.
  const site = resolveSiteUrl();
  return (
    <>
      <ButtonLink href={`${site}/`}>Back to home</ButtonLink>
      <ButtonLink href={`${site}/catalog`} variant="secondary">
        Browse the catalogue
      </ButtonLink>
      <ButtonLink href={`${site}/contact`} variant="secondary">
        Talk to us
      </ButtonLink>
    </>
  );
}

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Link href="/" aria-label="Zendropship home">
          <Logo />
        </Link>
      </header>
      <main className="container-page flex flex-1 flex-col items-start justify-center py-16">
        <p className="font-display text-7xl italic text-ink-300 md:text-9xl">404</p>
        <h1 className="mt-4 max-w-xl text-balance text-3xl font-semibold tracking-[-0.025em] md:text-5xl">We can’t find that page.</h1>
        <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-ink-600">The link may be out of date, or the page may have moved. Here are a few places to go next.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Suspense fallback={<ButtonLink href="/">Back to home</ButtonLink>}>
            <WaysOut />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
