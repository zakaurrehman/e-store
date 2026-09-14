"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavCategory } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";

type ExtraLink = { label: string; href: string; highlight?: boolean };

/** Departments shown in the bar; any beyond this move into a "More" menu so the header never wraps. */
export const MAX_NAV_DEPARTMENTS = 9;
const MORE_ID = "__more";

export function DesktopNav({ categories, extraLinks }: { categories: NavCategory[]; extraLinks: ExtraLink[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const openTimer = useRef<number | undefined>(undefined);
  const pathname = usePathname();

  // Close any open menu on navigation — adjusted during render rather than in an effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpenId(null);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scheduleOpen = (id: string) => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setOpenId(id), openId ? 0 : 90);
  };
  const scheduleClose = () => {
    window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenId(null), 140);
  };

  const visible = categories.slice(0, MAX_NAV_DEPARTMENTS);
  const overflow = categories.slice(MAX_NAV_DEPARTMENTS);
  const active = categories.find((category) => category.id === openId);

  return (
    <nav aria-label="Primary" className="hidden h-full lg:block" onMouseLeave={scheduleClose}>
      <ul className="flex h-full items-stretch gap-0.5 xl:gap-1">
        {visible.map((category) => {
          const isOpen = openId === category.id;
          const current = pathname === `/c/${category.slug}` || category.children.some((child) => pathname === `/c/${child.slug}`);
          return (
            <li key={category.id} className="flex items-stretch" onMouseEnter={() => scheduleOpen(category.id)}>
              <Link
                href={`/c/${category.slug}`}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex items-center whitespace-nowrap px-2 text-[0.875rem] font-medium text-ink-700 transition-colors hover:text-ink-950 xl:px-2.5",
                  (isOpen || current) && "text-ink-950",
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:origin-left after:scale-x-0 after:bg-ink-950 after:transition-transform after:duration-300 xl:after:inset-x-2.5",
                  (isOpen || current) && "after:scale-x-100",
                )}
              >
                {category.name}
              </Link>
              {category.children.length > 0 && (
                <button
                  type="button"
                  className="sr-only focus:not-sr-only focus:self-center focus:rounded-xs focus:px-1 focus:text-xs"
                  aria-expanded={isOpen}
                  aria-controls={`mega-${category.id}`}
                  onClick={() => setOpenId(isOpen ? null : category.id)}
                >
                  {isOpen ? "Close" : "Open"} {category.name} menu
                </button>
              )}
            </li>
          );
        })}
        {overflow.length > 0 && (
          <li className="flex items-stretch" onMouseEnter={() => scheduleOpen(MORE_ID)}>
            <button
              type="button"
              aria-expanded={openId === MORE_ID}
              aria-controls="mega-more"
              onClick={() => setOpenId(openId === MORE_ID ? null : MORE_ID)}
              className={cn(
                "relative flex items-center whitespace-nowrap px-2 text-[0.875rem] font-medium text-ink-700 transition-colors hover:text-ink-950 xl:px-2.5",
                openId === MORE_ID && "text-ink-950",
              )}
            >
              More
            </button>
          </li>
        )}
        {extraLinks.map((link) => (
          <li key={link.href} className="flex items-stretch" onMouseEnter={scheduleClose}>
            <Link
              href={link.href}
              className={cn(
                "flex items-center whitespace-nowrap px-2 text-[0.875rem] font-medium transition-colors xl:px-2.5",
                link.highlight ? "text-sale hover:text-[#9e2a13]" : "text-ink-700 hover:text-ink-950",
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      {openId === MORE_ID && overflow.length > 0 && (
        <div
          id="mega-more"
          className="absolute inset-x-0 top-full z-40 animate-fade-in border-b border-line bg-surface shadow-[0_24px_40px_-24px_rgb(11_12_14/0.18)]"
          onMouseEnter={() => window.clearTimeout(closeTimer.current)}
          onMouseLeave={scheduleClose}
        >
          <div className="container-page grid grid-cols-2 gap-10 py-9 md:grid-cols-4">
            {overflow.map((category) => (
              <div key={category.id}>
                <Link href={`/c/${category.slug}`} className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500 hover:text-ink-950">
                  {category.name}
                </Link>
                <ul className="mt-4 space-y-2.5">
                  {category.children.map((child) => (
                    <li key={child.id}>
                      <Link href={`/c/${child.slug}`} className="text-[0.9375rem] text-ink-800 transition-colors hover:text-ink-950 hover:underline hover:underline-offset-4">
                        {child.name}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href={`/c/${category.slug}`} className="text-[0.9375rem] font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
                      Shop all
                    </Link>
                  </li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {active && active.children.length > 0 && (
        <div
          id={`mega-${active.id}`}
          className="absolute inset-x-0 top-full z-40 animate-fade-in border-b border-line bg-surface shadow-[0_24px_40px_-24px_rgb(11_12_14/0.18)]"
          onMouseEnter={() => window.clearTimeout(closeTimer.current)}
          onMouseLeave={scheduleClose}
        >
          <div className="container-page grid grid-cols-12 gap-10 py-9">
            <div className="col-span-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">{active.name}</p>
              <ul className="mt-4 space-y-2.5">
                {active.children.map((child) => (
                  <li key={child.id}>
                    <Link href={`/c/${child.slug}`} className="text-[0.9375rem] text-ink-800 transition-colors hover:text-ink-950 hover:underline hover:underline-offset-4">
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/c/${active.slug}`} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
                Shop all {active.name} <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="col-span-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">Discover</p>
              <ul className="mt-4 space-y-2.5 text-[0.9375rem] text-ink-800">
                <li>
                  <Link href={`/c/${active.slug}?sort=newest`} className="hover:text-ink-950 hover:underline hover:underline-offset-4">
                    New in {active.name}
                  </Link>
                </li>
                <li>
                  <Link href={`/c/${active.slug}?sort=best-selling`} className="hover:text-ink-950 hover:underline hover:underline-offset-4">
                    Best sellers
                  </Link>
                </li>
                <li>
                  <Link href={`/c/${active.slug}?sale=1`} className="hover:text-ink-950 hover:underline hover:underline-offset-4">
                    On sale
                  </Link>
                </li>
              </ul>
            </div>
            {active.imageUrl && (
              <Link href={`/c/${active.slug}`} className="group col-span-6 grid grid-cols-2 gap-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-canvas">
                  <Image src={active.imageUrl} alt="" fill sizes="(min-width: 1280px) 360px, 280px" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
                </div>
                <div className="flex flex-col justify-end pb-1">
                  <p className="font-display text-3xl italic leading-tight text-ink-950">The {active.name} edit</p>
                  <p className="mt-2 text-sm text-ink-500">Considered pieces, chosen by our buyers this season.</p>
                  <span className="mt-4 text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 group-hover:decoration-ink-950">Explore</span>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
