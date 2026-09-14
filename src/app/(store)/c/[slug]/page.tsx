import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ListingSkeleton, ProductListing } from "@/components/store/listing/product-listing";
import { activeFilterCount, parseListingFilters } from "@/features/catalog/filters";
import { getCategoryBySlug } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";

export async function generateMetadata({ params, searchParams }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  const filters = parseListingFilters(query);
  const title = category.seoTitle ?? (category.parent ? `${category.parent.name}'s ${category.name}`.replace("Women's", "Women’s").replace("Men's", "Men’s") : category.name);
  const description = category.seoDescription ?? category.description ?? `Shop ${category.name} at Veyora.`;
  const filtered = activeFilterCount(filters) > 0 || filters.sort !== "featured";
  return {
    title,
    description,
    alternates: { canonical: filters.page > 1 && !filtered ? `/c/${slug}?page=${filters.page}` : `/c/${slug}` },
    // Filtered/sorted variations are crawlable but not indexed, avoiding duplicate content.
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: `/c/${slug}`, images: category.image ? [{ url: category.image.url }] : undefined },
  };
}

async function CategoryContent({ params, searchParams }: PageProps<"/c/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const crumbs = [
    ...(category.parent?.parent ? [{ name: category.parent.parent.name, href: `/c/${category.parent.parent.slug}` }] : []),
    ...(category.parent ? [{ name: category.parent.name, href: `/c/${category.parent.slug}` }] : []),
    { name: category.name, href: `/c/${category.slug}` },
  ];

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <header className="mt-6 max-w-3xl">
        <h1 className="text-balance text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">
          {category.parent && <span className="sr-only">{category.parent.name} </span>}
          {category.name}
        </h1>
        {category.description && <p className="mt-3 text-base leading-relaxed text-ink-600">{category.description}</p>}
      </header>
      {category.children.length > 0 && (
        <nav aria-label={`${category.name} categories`} className="scrollbar-none -mx-4 mt-7 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex gap-2">
            {category.children.map((child) => (
              <li key={child.id}>
                <Link href={`/c/${child.slug}`} className={cn("inline-flex h-9 items-center whitespace-nowrap rounded-full border border-line-strong px-4 text-sm text-ink-800 transition-colors hover:border-ink-950 hover:text-ink-950")}>
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="mt-10">
        <ProductListing basePath={`/c/${category.slug}`} scope={{ categorySlug: category.slug }} searchParams={query} hideCategoryFacet={category.children.length === 0} />
      </div>
    </>
  );
}

export default function CategoryPage(props: PageProps<"/c/[slug]">) {
  return (
    <div className="container-page pb-20 pt-6">
      <Suspense
        fallback={
          <>
            <div className="skeleton h-4 w-40 rounded-sm" />
            <div className="skeleton mt-6 h-12 w-72 rounded-sm" />
            <div className="mt-10">
              <ListingSkeleton />
            </div>
          </>
        }
      >
        <CategoryContent {...props} />
      </Suspense>
    </div>
  );
}
