import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductEditor } from "@/components/admin/products/product-editor";
import { PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { getEditorOptions, getProductForEditor } from "@/features/admin/products/queries";
import { can, requirePagePermission } from "@/server/auth/guards";
import { DeleteProductButton, DuplicateProductButton } from "./buttons";

export const metadata: Metadata = { title: "Edit product" };

async function Editor({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requirePagePermission("products.view", "/admin/products")]);
  const [product, options] = await Promise.all([getProductForEditor(id), getEditorOptions()]);
  if (!product) notFound();
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: product.name }]}
        title={product.name}
        description={`${product.variants.length} variant${product.variants.length === 1 ? "" : "s"} · ${product.status.toLowerCase()}`}
        actions={
          <>
            {can(user, "products.create") && <DuplicateProductButton productId={product.id} />}
            {can(user, "products.delete") && <DeleteProductButton productId={product.id} name={product.name} autoOpen={query.confirmDelete === "1"} />}
          </>
        }
      />
      <ProductEditor product={product} options={options} canDelete={can(user, "products.delete")} />
    </>
  );
}

export default function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Editor {...props} />
    </Suspense>
  );
}

