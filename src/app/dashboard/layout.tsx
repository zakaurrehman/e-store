import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardNav } from "@/components/dashboard/nav";
import { SupportWidget } from "@/components/support/support-widget";
import { OrderStatus } from "@/generated/prisma/enums";
import { requireStoreOwner } from "@/features/stores/guards";
import { countUnreadOwnerTickets } from "@/features/support/queries";
import { storeUrl } from "@/lib/tenancy";
import { db } from "@/server/db";

export const metadata: Metadata = { title: { default: "Your store", template: "%s · Zendropship" }, robots: { index: false, follow: false } };

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, store } = await requireStoreOwner("/dashboard");
  const [customers, tickets, orders] = await Promise.all([
    db.contactMessage.count({ where: { storeId: store.id, unreadForStaff: true } }),
    countUnreadOwnerTickets(user.id),
    db.order.count({ where: { storeId: store.id, status: OrderStatus.AWAITING_FUNDS } }),
  ]);
  // One badge for anything waiting on the owner: a customer's message or a reply from Zendropship.
  const support = customers + tickets;
  return (
    <div className="min-h-dvh bg-canvas">
      <DashboardNav store={{ name: store.name, url: storeUrl(store.slug), status: store.status }} user={{ name: `${user.firstName} ${user.lastName}`, email: user.email }} badges={{ support, orders }} />
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-[80rem] px-4 pb-20 pt-20 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      </div>
      {/* Reaching Zendropship from wherever they are, in the same threads as Customer service. */}
      <SupportWidget inboxHref="/dashboard/support/tickets" />
    </div>
  );
}

/** The store owner's back office on the platform site. Every page re-checks ownership through requireStoreOwner. */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
