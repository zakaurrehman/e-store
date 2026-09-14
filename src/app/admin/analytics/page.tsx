import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView, RangeFilter } from "@/components/admin/dashboard-view";
import { PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { getDashboardData } from "@/features/admin/dashboard";
import { requirePagePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Analytics" };

async function Analytics({ searchParams }: PageProps<"/admin/analytics">) {
  const [, query] = await Promise.all([requirePagePermission("analytics.view", "/admin/analytics"), searchParams]);
  const data = await getDashboardData(typeof query.range === "string" ? query.range : undefined);
  return (
    <>
      <PageHeader title="Analytics" description="Sales, customers and inventory. Revenue counts paid orders net of refunds; conversion rate requires a web analytics integration and is not estimated." />
      <RangeFilter current={data.range.key} basePath="/admin/analytics" />
      <DashboardView data={data} detailed />
    </>
  );
}

export default function AnalyticsPage(props: PageProps<"/admin/analytics">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Analytics {...props} />
    </Suspense>
  );
}
