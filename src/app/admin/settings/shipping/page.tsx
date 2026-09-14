import type { Metadata } from "next";
import { Suspense } from "react";
import { ShippingManager } from "@/components/admin/settings/settings-forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Shipping & tax" };

async function Shipping() {
  await requirePagePermission("shipping.manage", "/admin/settings/shipping");
  const [zones, taxRates] = await Promise.all([db.shippingZone.findMany({ orderBy: { position: "asc" }, include: { methods: { orderBy: { position: "asc" } } } }), db.taxRate.findMany({ orderBy: [{ country: "asc" }, { region: "asc" }] })]);
  return (
    <>
      <PageHeader title="Shipping & tax" description="Delivery options and tax rates are applied at checkout based on the shipping address." />
      <Card>
        <ShippingManager zones={zones} taxRates={taxRates} />
      </Card>
    </>
  );
}

export default function ShippingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Shipping />
    </Suspense>
  );
}
