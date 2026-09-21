"use client";

import { CreditCard, ExternalLink, LayoutDashboard, LifeBuoy, LogOut, Menu, Package, Palette, Search, ShoppingBag, Tags, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { logoutAction } from "@/features/auth/actions";
import { cn } from "@/utils/cn";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/products", label: "Products", icon: Package },
  { href: "/catalog", label: "Find products", icon: Search },
  { href: "/dashboard/orders", label: "Orders", icon: ShoppingBag },
  { href: "/dashboard/balance", label: "Balance", icon: Wallet },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/support", label: "Customer service", icon: LifeBuoy },
  { href: "/dashboard/design", label: "Design & details", icon: Palette },
  { href: "/dashboard/pricing", label: "Pricing", icon: Tags },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
];

export function DashboardNav({ store, user }: { store: { name: string; url: string; status: string }; user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the drawer on navigation — adjusted during render rather than in an effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-line px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Zendropship home">
          <LogoMark className="size-7" title="" />
          <span className="text-sm font-semibold tracking-[0.2em]">ZENDROPSHIP</span>
        </Link>
        <button type="button" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <div className="border-b border-line px-5 py-4">
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">Your store</p>
        <p className="mt-1 truncate font-semibold text-ink-950">{store.name}</p>
        <a href={store.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate text-[0.8125rem] text-iris-600 hover:underline">
          {store.url.replace(/^https?:\/\//, "")} <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
        {store.status === "SUSPENDED" && <p className="mt-2 rounded-xs bg-danger/10 px-2 py-1 text-[0.75rem] font-medium text-danger">Suspended — contact support</p>}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Store dashboard">
        <ul className="space-y-0.5">
          {ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-2.5 rounded-sm px-2 py-[0.4375rem] text-[0.875rem] transition-colors", active ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-canvas hover:text-ink-950")}
                >
                  <item.icon className="size-4" strokeWidth={1.7} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-line p-3">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-[0.75rem] text-ink-500">{user.email}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="mt-1 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-[0.8125rem] text-ink-600 hover:bg-canvas hover:text-ink-950">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-3 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex size-10 items-center justify-center rounded-sm" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <span className="truncate font-semibold">{store.name}</span>
      </div>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-surface lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-ink-950/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in-left bg-surface shadow-pop">{content}</aside>
        </div>
      )}
    </>
  );
}
