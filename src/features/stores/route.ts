import "server-only";
import { notFound } from "next/navigation";
import { scopeOf, type StoreContext, type StoreScope } from "./context";
import { getStoreBySlug } from "./queries";

/** Resolves the `[store]` route param to a live store, or renders the 404 page. */
export async function storeFromParams(params: Promise<{ store: string }>): Promise<StoreContext> {
  const { store: slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  return store;
}

/** The store and its catalogue scope in one call — what most storefront pages need. */
export async function storeAndScope(params: Promise<{ store: string }>): Promise<{ store: StoreContext; scope: StoreScope }> {
  const store = await storeFromParams(params);
  return { store, scope: scopeOf(store) };
}
