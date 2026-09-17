"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Link href="/" aria-label="Zendropship home">
          <Logo />
        </Link>
      </header>
      <main className="container-page flex flex-1 flex-col items-start justify-center py-16">
        <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-500">Something went wrong</p>
        <h1 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.025em] md:text-5xl">We hit a snag loading this page.</h1>
        <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-ink-600">It’s not you — something on our side didn’t respond. Please try again; if it keeps happening, our team is here to help.</p>
        {error.digest && <p className="mt-3 text-[0.75rem] text-ink-400">Reference: {error.digest}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Back to home
          </ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Contact us
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
