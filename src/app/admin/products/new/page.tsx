import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductEditor } from "@/components/admin/products/product-editor";
import { PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { getEditorOptions } from "@/features/admin/products/queries";
import { requirePagePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "New product" };

async function NewProduct() {
  await requirePagePermission("products.create", "/admin/products/new");
  const options = await getEditorOptions();
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "New product" }]} title="New product" description="Products are created as drafts until you set them to active." />
      <ProductEditor product={null} options={options} canDelete={false} />
    </>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NewProduct />
    </Suspense>
  );
}
