import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/nav";
import { ToastProvider } from "@/components/ui/toast";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Veyora Admin" }, robots: { index: false, follow: false } };

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireStaff("/admin");
  const unread = await db.notification.count({ where: { audience: "STAFF", readAt: null, OR: [{ userId: null }, { userId: user.id }] } });
  return (
    <div className="min-h-dvh bg-canvas">
      <AdminNav permissions={user.permissions} user={{ name: `${user.firstName} ${user.lastName}`, role: user.role.name }} unread={unread} />
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-[90rem] px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <ToastProvider>
      <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </ToastProvider>
  );
}
