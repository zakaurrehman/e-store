import { Heart, Menu, User } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { getCategoryTree } from "@/features/catalog/queries";
import { getStoreSettings } from "@/features/settings/queries";
import { getCurrentUser } from "@/server/auth/session";
import { cn } from "@/utils/cn";
import { SearchButton } from "../search/search-dialog";
import { BagButton } from "./bag-button";
import { DesktopNav, MAX_NAV_DEPARTMENTS } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";

const EXTRA_LINKS = [
  { label: "Brands", href: "/brands" },
  { label: "Sale", href: "/collections/sale", highlight: true },
];

const iconButton = "inline-flex size-10 items-center justify-center rounded-sm text-ink-950 transition-colors hover:bg-canvas";

async function AccountLink() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className={iconButton} aria-label="Sign in">
        <User className="size-5" strokeWidth={1.6} />
      </Link>
    );
  }
  return (
    <Link href={user.role.isStaff ? "/account" : "/account"} className={iconButton} aria-label={`Account for ${user.firstName}`}>
      <span className="flex size-7 items-center justify-center rounded-full bg-ink-950 text-[0.6875rem] font-semibold uppercase text-white">
        {user.firstName[0]}
        {user.lastName[0]}
      </span>
    </Link>
  );
}

export async function AnnouncementBar() {
  const settings = await getStoreSettings();
  if (!settings.announcement.enabled || !settings.announcement.message) return null;
  const content = <span className="truncate">{settings.announcement.message}</span>;
  return (
    <div className="bg-ink-950 text-white">
      <div className="container-page flex h-9 items-center justify-center text-[0.75rem] font-medium tracking-[0.02em]">
        {settings.announcement.href ? (
          <Link href={settings.announcement.href} className="flex min-w-0 items-center gap-2 hover:underline hover:underline-offset-4">
            {content}
          </Link>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

/** Prerendered stand-ins shown until the URL-aware navigation hydrates (same markup, no interactivity). */
function MobileMenuFallback() {
  return (
    <span className="-ml-2 inline-flex size-10 items-center justify-center text-ink-950 lg:hidden" aria-hidden>
      <Menu className="size-[1.375rem]" strokeWidth={1.6} />
    </span>
  );
}

function DesktopNavFallback({ categories }: { categories: Awaited<ReturnType<typeof getCategoryTree>> }) {
  return (
    <nav aria-label="Primary" className="hidden h-full lg:block">
      <ul className="flex h-full items-stretch gap-0.5 xl:gap-1">
        {categories.slice(0, MAX_NAV_DEPARTMENTS).map((category) => (
          <li key={category.id} className="flex items-stretch">
            <Link href={`/c/${category.slug}`} className="flex items-center whitespace-nowrap px-2 text-[0.875rem] font-medium text-ink-700 xl:px-2.5">
              {category.name}
            </Link>
          </li>
        ))}
        {EXTRA_LINKS.map((link) => (
          <li key={link.href} className="flex items-stretch">
            <Link href={link.href} className={`flex items-center whitespace-nowrap px-2 text-[0.875rem] font-medium xl:px-2.5 ${link.highlight ? "text-sale" : "text-ink-700"}`}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export async function SiteHeader() {
  const categories = await getCategoryTree();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-surface/85">
      <div className="container-page relative flex h-16 items-center gap-4 lg:h-[4.5rem]">
        <div className="flex flex-1 items-center gap-2 lg:flex-none">
          <Suspense fallback={<MobileMenuFallback />}>
            <MobileMenu categories={categories} extraLinks={EXTRA_LINKS} />
          </Suspense>
          <SearchButton className={cn(iconButton, "lg:hidden")} />
        </div>
        <Link href="/" className="shrink-0 rounded-xs" aria-label="Zendropship home">
          <Logo className="hidden sm:inline-flex" />
          <Logo className="sm:hidden" markClassName="size-6" />
        </Link>
        <div className="hidden h-full flex-1 items-stretch justify-center lg:flex">
          <Suspense fallback={<DesktopNavFallback categories={categories} />}>
            <DesktopNav categories={categories} extraLinks={EXTRA_LINKS} />
          </Suspense>
        </div>
        <div className="flex flex-1 items-center justify-end gap-0.5 lg:flex-none">
          <SearchButton className="mr-1 hidden h-10 w-56 items-center gap-2.5 rounded-sm border border-line bg-canvas/60 px-3 text-left text-sm text-ink-500 transition-colors hover:border-line-strong xl:flex">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 3.5 3.5" strokeLinecap="round" />
            </svg>
            <span className="flex-1">Search</span>
            <kbd className="rounded-xs border border-line bg-surface px-1.5 font-sans text-[0.6875rem]">/</kbd>
          </SearchButton>
          <SearchButton className={cn(iconButton, "hidden lg:inline-flex xl:hidden")} />
          <Suspense
            fallback={
              <Link href="/account" className={cn(iconButton, "hidden sm:inline-flex")} aria-label="Account">
                <User className="size-5" strokeWidth={1.6} />
              </Link>
            }
          >
            <span className="hidden sm:inline-flex">
              <AccountLink />
            </span>
          </Suspense>
          <Link href="/wishlist" className={cn(iconButton, "hidden sm:inline-flex")} aria-label="Wishlist">
            <Heart className="size-5" strokeWidth={1.6} />
          </Link>
          <BagButton className={iconButton} />
        </div>
      </div>
    </header>
  );
}
