import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardNav } from "@/components/dashboard/nav";
import { requireStoreOwner } from "@/features/stores/guards";
import { storeUrl } from "@/lib/tenancy";

export const metadata: Metadata = { title: { default: "Your store", template: "%s · Zendropship" }, robots: { index: false, follow: false } };

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, store } = await requireStoreOwner("/dashboard");
  return (
    <div className="min-h-dvh bg-canvas">
      <DashboardNav store={{ name: store.name, url: storeUrl(store.slug), status: store.status }} user={{ name: `${user.firstName} ${user.lastName}`, email: user.email }} />
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-[80rem] px-4 pb-20 pt-20 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      </div>
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
