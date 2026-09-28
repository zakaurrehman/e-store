import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/nav";
import { ToastProvider } from "@/components/ui/toast";
import { staffAlerts } from "@/features/admin/alerts";
import { requireStaff } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Zendropship Admin" },
  robots: { index: false, follow: false },
  // Installable on a phone's Home Screen — which is what lets an iPhone show alerts (see PushAlerts).
  manifest: "/zendropship-admin.webmanifest",
  appleWebApp: { capable: true, title: "ZD Admin", statusBarStyle: "default" },
  icons: { apple: "/zendropship-admin-apple-180.png" },
};

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireStaff("/admin");
  const alerts = await staffAlerts(user);
  return (
    <div className="min-h-dvh bg-canvas">
      <AdminNav permissions={user.permissions} user={{ name: `${user.firstName} ${user.lastName}`, role: user.role.name }} alerts={alerts} />
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
