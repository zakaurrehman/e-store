import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView, RangeFilter } from "@/components/admin/dashboard-view";
import { PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { getDashboardData } from "@/features/admin/dashboard";
import { requirePagePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Dashboard" };

async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const [user, query] = await Promise.all([requirePagePermission("dashboard.view"), searchParams]);
  const data = await getDashboardData(typeof query.range === "string" ? query.range : undefined);
  const greeting = new Date().getUTCHours() < 12 ? "Good morning" : new Date().getUTCHours() < 18 ? "Good afternoon" : "Good evening";
  return (
    <>
      <PageHeader title={`${greeting}, ${user.firstName}`} description={`Here's how the store is doing · ${data.range.label.toLowerCase()}`} />
      <RangeFilter current={data.range.key} basePath="/admin" />
      <DashboardView data={data} />
    </>
  );
}

export default function AdminDashboardPage(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Dashboard {...props} />
    </Suspense>
  );
}
