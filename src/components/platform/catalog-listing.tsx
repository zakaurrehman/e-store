import Link from "next/link";
import { ProductListing } from "@/components/store/listing/product-listing";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import type { SearchParamsRecord } from "@/features/catalog/filters";
import { getCategoryTree, type ListingScope } from "@/features/catalog/queries";
import { commissionRuleOf } from "@/features/finance/order-finance";
import { getStoreSettings } from "@/features/settings/queries";
import { getOwnedStore, getShelfProductIds } from "@/features/stores/queries";
import { getCurrentUser } from "@/server/auth/session";
import { cn } from "@/utils/cn";

/** Department chips across the top of the platform catalogue. */
export async function CatalogDepartments({ active }: { active?: string }) {
  const departments = await getCategoryTree();
  return (
    <nav aria-label="Departments" className="scrollbar-none -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-2">
        <li>
          <Link href="/catalog" className={cn("inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors", !active ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong text-ink-800 hover:border-ink-950")}>
            All products
          </Link>
        </li>
        {departments.map((department) => (
          <li key={department.id}>
            <Link
              href={`/catalog/c/${department.slug}`}
              className={cn("inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors", active === department.slug ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong text-ink-800 hover:border-ink-950")}
            >
              {department.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The platform catalogue grid: every product, at suggested prices, with wholesale and margin for owners. */
export async function CatalogListing({ basePath, scope, searchParams, hideCategoryFacet }: { basePath: string; scope: ListingScope; searchParams: SearchParamsRecord; hideCategoryFacet?: boolean }) {
  const [user, settings] = await Promise.all([getCurrentUser(), getStoreSettings()]);
  const store = user ? await getOwnedStore(user.id) : null;
  const inStoreIds = store ? await getShelfProductIds(store.id) : [];
  return (
    <ProductListing
      basePath={basePath}
      scope={scope}
      catalog={null}
      searchParams={searchParams}
      hideCategoryFacet={hideCategoryFacet}
      ownerView={{ inStoreIds, signedIn: !!user, commission: commissionRuleOf(settings.platform) }}
      emptyState={<EmptyState title="No products here yet" description="New products are added to the catalogue regularly." action={<ButtonLink href="/catalog">Browse the whole catalogue</ButtonLink>} />}
    />
  );
}
