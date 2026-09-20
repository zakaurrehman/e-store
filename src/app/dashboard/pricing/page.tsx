import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader } from "@/components/admin/ui";
import { StorePricingForm } from "@/components/dashboard/controls";
import { Skeleton } from "@/components/ui/misc";
import { listStoreProducts } from "@/features/stores/dashboard";
import { requireStoreOwner } from "@/features/stores/guards";

export const metadata: Metadata = { title: "Pricing" };

async function Pricing() {
  const { store } = await requireStoreOwner("/dashboard/pricing");
  const rule = { mode: store.pricingMode, markupBps: store.markupBps };
  const { rows } = await listStoreProducts({ id: store.id, pricing: rule }, { pageSize: 1 });
  const example = rows[0] ? { name: rows[0].name, costCents: rows[0].costCents, suggestedCents: rows[0].suggestedCents } : null;
  return (
    <Card title="How your store sets prices">
      <StorePricingForm mode={store.pricingMode} markupBps={store.markupBps} example={example} />
    </Card>
  );
}

export default function DashboardPricingPage() {
  return (
    <>
      <PageHeader title="Pricing" description="One rule for your whole store. You can still give individual products their own price." />
      <Suspense fallback={<Skeleton className="h-72" />}>
        <Pricing />
      </Suspense>
    </>
  );
}
