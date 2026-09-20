import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { getOwnedStore } from "@/features/stores/queries";
import { DEMO_STORE_SLUG, storeUrl } from "@/lib/tenancy";
import { getCurrentUser } from "@/server/auth/session";

const NAV = [
  { label: "Catalogue", href: "/catalog" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Demo store", href: storeUrl(DEMO_STORE_SLUG), external: true },
];

function GuestActions() {
  return (
    <>
      <Link href="/login" className="hidden h-9 items-center rounded-sm px-3 text-sm font-medium text-ink-700 hover:bg-canvas hover:text-ink-950 sm:inline-flex">
        Sign in
      </Link>
      <ButtonLink href="/start" size="sm">
        Create your store
      </ButtonLink>
    </>
  );
}

async function AccountActions() {
  const user = await getCurrentUser();
  if (!user) return <GuestActions />;
  const store = await getOwnedStore(user.id);
  return (
    <>
      {user.role.isStaff && (
        <Link href="/admin" className="hidden h-9 items-center rounded-sm px-3 text-sm font-medium text-ink-700 hover:bg-canvas hover:text-ink-950 sm:inline-flex">
          Admin
        </Link>
      )}
      {store ? (
        <ButtonLink href="/dashboard" size="sm">
          My store
        </ButtonLink>
      ) : (
        <ButtonLink href="/start" size="sm">
          Create your store
        </ButtonLink>
      )}
    </>
  );
}

export function PlatformHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="container-page flex h-16 items-center gap-6">
        <Link href="/" className="shrink-0 rounded-xs" aria-label="Zendropship home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.label}>
                {item.external ? (
                  <a href={item.href} className="inline-flex h-9 items-center rounded-sm px-3 text-sm font-medium text-ink-700 hover:bg-canvas hover:text-ink-950">
                    {item.label}
                  </a>
                ) : (
                  <Link href={item.href} className="inline-flex h-9 items-center rounded-sm px-3 text-sm font-medium text-ink-700 hover:bg-canvas hover:text-ink-950">
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Suspense fallback={<GuestActions />}>
            <AccountActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
