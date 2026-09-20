import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogDepartments, CatalogListing } from "@/components/platform/catalog-listing";
import { ListingSkeleton } from "@/components/store/listing/product-listing";
import { getCategoryBySlug } from "@/features/catalog/queries";

export async function generateMetadata({ params }: PageProps<"/catalog/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  return { title: `${category.name} to sell`, description: `${category.name} products you can add to your Zendropship store.`, alternates: { canonical: `/catalog/c/${slug}` } };
}

async function CategoryContent({ params, searchParams }: PageProps<"/catalog/c/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const department = category.parent?.parent?.slug ?? category.parent?.slug ?? category.slug;
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
        <Link href="/catalog" className="hover:text-ink-950">Catalogue</Link>
        {category.parent && (
          <>
            {" / "}
            <Link href={`/catalog/c/${category.parent.slug}`} className="hover:text-ink-950">{category.parent.name}</Link>
          </>
        )}
      </nav>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">{category.name}</h1>
      <div className="mt-8">
        <Suspense fallback={null}>
          <CatalogDepartments active={department} />
        </Suspense>
      </div>
      {category.children.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {category.children.map((child) => (
            <li key={child.id}>
              <Link href={`/catalog/c/${child.slug}`} className="inline-flex h-8 items-center rounded-full bg-canvas px-3.5 text-[0.8125rem] text-ink-800 hover:bg-canvas-deep">
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-10">
        <CatalogListing basePath={`/catalog/c/${category.slug}`} scope={{ categorySlug: category.slug }} searchParams={query} hideCategoryFacet={category.children.length === 0} />
      </div>
    </>
  );
}

export default function CatalogCategoryPage(props: PageProps<"/catalog/c/[slug]">) {
  return (
    <div className="container-page pb-20 pt-10">
      <Suspense fallback={<ListingSkeleton />}>
        <CategoryContent {...props} />
      </Suspense>
    </div>
  );
}
