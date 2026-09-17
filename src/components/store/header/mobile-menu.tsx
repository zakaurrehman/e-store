"use client";

import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import type { NavCategory } from "@/features/catalog/queries";

export const OPEN_MOBILE_MENU_EVENT = "zendropship:open-menu";

export function MobileMenu({ categories, extraLinks }: { categories: NavCategory[]; extraLinks: Array<{ label: string; href: string; highlight?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the menu on navigation — adjusted during render rather than in an effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_MOBILE_MENU_EVENT, handler);
    return () => window.removeEventListener(OPEN_MOBILE_MENU_EVENT, handler);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 inline-flex size-10 items-center justify-center rounded-sm text-ink-950 lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="size-[1.375rem]" strokeWidth={1.6} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} variant="left" title="Menu" bodyClassName="px-0 sm:px-0 pb-8">
        <nav aria-label="Mobile">
          <ul className="border-t border-line">
            {categories.map((category) => (
              <li key={category.id} className="border-b border-line">
                {category.children.length > 0 ? (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[1.0625rem] font-medium text-ink-950 [&::-webkit-details-marker]:hidden">
                      {category.name}
                      <ChevronDown className="size-4 text-ink-500 transition-transform duration-200 group-open:rotate-180" aria-hidden />
                    </summary>
                    <ul className="pb-3">
                      <li>
                        <Link href={`/c/${category.slug}`} className="block px-8 py-2.5 text-[0.9375rem] font-medium text-ink-950">
                          Shop all {category.name}
                        </Link>
                      </li>
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <Link href={`/c/${child.slug}`} className="block px-8 py-2.5 text-[0.9375rem] text-ink-700">
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Link href={`/c/${category.slug}`} className="block px-5 py-4 text-[1.0625rem] font-medium">
                    {category.name}
                  </Link>
                )}
              </li>
            ))}
            {extraLinks.map((link) => (
              <li key={link.href} className="border-b border-line">
                <Link href={link.href} className={`block px-5 py-4 text-[1.0625rem] font-medium ${link.highlight ? "text-sale" : "text-ink-950"}`}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-6 space-y-1 px-5 text-[0.9375rem] text-ink-700">
            <li>
              <Link href="/account" className="block py-2">
                My account
              </Link>
            </li>
            <li>
              <Link href="/wishlist" className="block py-2">
                Wishlist
              </Link>
            </li>
            <li>
              <Link href="/track-order" className="block py-2">
                Track an order
              </Link>
            </li>
            <li>
              <Link href="/contact" className="block py-2">
                Help &amp; contact
              </Link>
            </li>
          </ul>
        </nav>
      </Dialog>
    </>
  );
}
