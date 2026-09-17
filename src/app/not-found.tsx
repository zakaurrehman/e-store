import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

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
        <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-ink-600">The link may be out of date, or the product may no longer be available. Here are a few places to go next.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/">Back to home</ButtonLink>
          <ButtonLink href="/collections/new-arrivals" variant="secondary">
            New arrivals
          </ButtonLink>
          <ButtonLink href="/search" variant="secondary">
            Search
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
