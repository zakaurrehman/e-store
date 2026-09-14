import type { Metadata } from "next";
import { Suspense } from "react";
import { AttributesManager, BrandsManager, CategoriesManager, CollectionsManager, TagsManager, type CategoryNode } from "@/components/admin/catalog/catalog-manager";
import { Card, FilterLink, PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Categories & brands" };

const TABS = [
  ["categories", "Categories"],
  ["brands", "Brands"],
  ["collections", "Collections"],
  ["tags", "Tags"],
  ["attributes", "Attributes"],
] as const;

async function Catalog({ searchParams }: PageProps<"/admin/catalog">) {
  const [, query] = await Promise.all([requirePagePermission("catalog.manage", "/admin/catalog"), searchParams]);
  const tab = TABS.find(([key]) => key === query.tab)?.[0] ?? "categories";

  let content: React.ReactNode = null;
  if (tab === "categories") {
    const categories = await db.category.findMany({ where: { deletedAt: null }, orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
    const toNode = (category: (typeof categories)[number]): CategoryNode => ({ id: category.id, name: category.name, slug: category.slug, parentId: category.parentId, description: category.description, isActive: category.isActive, showInNav: category.showInNav, seoTitle: category.seoTitle, seoDescription: category.seoDescription, productCount: category._count.products, children: categories.filter((child) => child.parentId === category.id).map(toNode) });
    content = <CategoriesManager tree={categories.filter((category) => !category.parentId).map(toNode)} />;
  } else if (tab === "brands") {
    const brands = await db.brand.findMany({ where: { deletedAt: null }, orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
    content = <BrandsManager brands={brands.map((brand) => ({ ...brand, productCount: brand._count.products }))} />;
  } else if (tab === "collections") {
    const collections = await db.collection.findMany({ where: { deletedAt: null }, orderBy: { position: "asc" }, include: { _count: { select: { products: true } } } });
    content = <CollectionsManager collections={collections.map((collection) => ({ ...collection, productCount: collection._count.products }))} />;
  } else if (tab === "tags") {
    const tags = await db.tag.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
    content = <TagsManager tags={tags.map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug, productCount: tag._count.products }))} />;
  } else {
    const attributes = await db.attribute.findMany({ orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" }, select: { value: true, colorHex: true } } } });
    content = <AttributesManager attributes={attributes} />;
  }

  return (
    <>
      <PageHeader title="Categories & brands" description="Organise the catalogue. Drag rows to change the order shown in navigation and filters." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <FilterLink key={key} href={`/admin/catalog?tab=${key}`} active={tab === key}>
            {label}
          </FilterLink>
        ))}
      </div>
      <Card>{content}</Card>
    </>
  );
}

export default function CatalogPage(props: PageProps<"/admin/catalog">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Catalog {...props} />
    </Suspense>
  );
}
