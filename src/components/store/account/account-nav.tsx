"use client";

import { Bell, Clock, Heart, LifeBuoy, LogOut, MapPin, Package, Shield, Star, User, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/features/auth/actions";
import { cn } from "@/utils/cn";

const LINKS = [
  { href: "/account", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/support", label: "Customer service", icon: LifeBuoy },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/recently-viewed", label: "Recently viewed", icon: Clock },
  { href: "/account/reviews", label: "Reviews", icon: Star },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/profile", label: "Profile", icon: User },
  { href: "/account/security", label: "Password & security", icon: Shield },
];

export function AccountNav({ unread, unreadSupport, isStaff }: { unread: number; unreadSupport: number; isStaff: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="lg:sticky lg:top-24">
      <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:px-0 lg:pb-0">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-sm px-3 py-2 text-[0.9375rem] transition-colors",
                  active ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-canvas hover:text-ink-950",
                )}
              >
                <link.icon className="size-4" strokeWidth={1.7} aria-hidden />
                {link.label}
                {((link.href === "/account/notifications" && unread > 0) || (link.href === "/support" && unreadSupport > 0)) && (
                  <span className={cn("tabular ml-auto rounded-full px-1.5 text-[0.6875rem] font-semibold", active ? "bg-white/20 text-white" : "bg-ink-950 text-white")}>
                    {link.href === "/support" ? unreadSupport : unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {isStaff && (
          <li className="shrink-0">
            <Link href="/admin" className="flex items-center gap-2.5 whitespace-nowrap rounded-sm px-3 py-2 text-[0.9375rem] text-iris-700 hover:bg-iris-50">
              <LayoutDashboard className="size-4" strokeWidth={1.7} aria-hidden /> Admin dashboard
            </Link>
          </li>
        )}
        <li className="shrink-0 lg:mt-4 lg:border-t lg:border-line lg:pt-4">
          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-sm px-3 py-2 text-left text-[0.9375rem] text-ink-700 hover:bg-canvas hover:text-ink-950">
              <LogOut className="size-4" strokeWidth={1.7} aria-hidden /> Sign out
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
