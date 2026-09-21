"use client";

import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Wallet,
  Tags,
  Ticket,
  Truck,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { logoutAction } from "@/features/auth/actions";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/utils/cn";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; permission?: Permission; exact?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view", exact: true },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.view" },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/admin/stores", label: "Stores", icon: Store, permission: "stores.view" },
      { href: "/admin/payouts", label: "Withdrawals", icon: Wallet, permission: "stores.view" },
      { href: "/admin/referrals", label: "Invitations", icon: Ticket, permission: "stores.view" },
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag, permission: "orders.view" },
      { href: "/admin/customers", label: "Customers", icon: Users, permission: "customers.view" },
      { href: "/admin/discounts", label: "Discounts", icon: Ticket, permission: "discounts.manage" },
      { href: "/admin/messages", label: "Support inbox", icon: Inbox, permission: "messages.view" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: Package, permission: "products.view" },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes, permission: "products.view" },
      { href: "/admin/catalog", label: "Categories & brands", icon: Tags, permission: "catalog.manage" },
      { href: "/admin/reviews", label: "Reviews", icon: Star, permission: "reviews.moderate" },
      { href: "/admin/imports", label: "Import & export", icon: Upload, permission: "products.import" },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/admin/content", label: "Homepage & banners", icon: LayoutTemplate, permission: "content.manage" },
      { href: "/admin/content/pages", label: "Pages & FAQ", icon: FileText, permission: "content.manage" },
      { href: "/admin/media", label: "Media library", icon: ImageIcon, permission: "media.manage" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/admin/settings", label: "Store settings", icon: Settings, permission: "settings.manage", exact: true },
      { href: "/admin/settings/shipping", label: "Shipping & tax", icon: Truck, permission: "shipping.manage" },
      { href: "/admin/settings/staff", label: "Staff & roles", icon: Users, permission: "staff.manage" },
      { href: "/admin/settings/audit", label: "Audit log", icon: ClipboardList, permission: "audit.view" },
    ],
  },
];

export function AdminNav({ permissions, user, unread }: { permissions: string[]; user: { name: string; role: string }; unread: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the drawer on navigation — adjusted during render rather than in an effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }
  const granted = new Set(permissions);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-line px-5">
        <Link href="/admin" className="flex items-center gap-2.5">
          <LogoMark className="size-7" title="" />
          <span className="text-sm font-semibold tracking-[0.2em]">ZENDROPSHIP</span>
          <span className="rounded-xs bg-canvas px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-600">Admin</span>
        </Link>
        <button type="button" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        {GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.permission || granted.has(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="mb-4">
              <p className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">{group.title}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const settingsOverlap = item.href === "/admin/settings" && pathname.startsWith("/admin/settings/");
                  const contentOverlap = item.href === "/admin/content" && pathname.startsWith("/admin/content/pages");
                  const isActive = active && !settingsOverlap && !contentOverlap;
                  return (
                    <li key={item.href}>
                      <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-sm px-2 py-[0.3125rem] text-[0.875rem] transition-colors", isActive ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-canvas hover:text-ink-950")}>
                        <item.icon className="size-4" strokeWidth={1.7} />
                        <span className="flex-1">{item.label}</span>
                        {item.href === "/admin/notifications" && unread > 0 && <span className={cn("tabular rounded-full px-1.5 text-[0.6875rem] font-semibold", isActive ? "bg-white/20" : "bg-ink-950 text-white")}>{unread}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-ink-950 text-[0.6875rem] font-semibold uppercase text-white">{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-[0.75rem] text-ink-500">{user.role}</p>
          </div>
        </div>
        <div className="mt-1 flex gap-1">
          <Link href="/" target="_blank" className="flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-[0.8125rem] text-ink-600 hover:bg-canvas hover:text-ink-950">
            <ExternalLink className="size-3.5" /> View site
          </Link>
          <form action={logoutAction} className="flex-1">
            <button type="submit" className="flex w-full items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-[0.8125rem] text-ink-600 hover:bg-canvas hover:text-ink-950">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed left-3 top-3 z-30 inline-flex size-10 items-center justify-center rounded-sm bg-surface shadow-hairline lg:hidden" aria-label="Open admin menu">
        <Menu className="size-5" />
      </button>
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
