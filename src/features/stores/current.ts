import "server-only";
import { headers } from "next/headers";
import { classifyHost, storeBaseDomain } from "@/lib/tenancy";
import { DomainError } from "@/server/errors";
import type { StoreContext } from "./context";
import { getStoreBySlug } from "./queries";

/**
 * The store a server action or route handler is running for, from the request's Host header.
 * Pages get the store from their `[store]` route param instead (the proxy rewrites <slug>.host to /s/<slug>).
 */
export async function getCurrentStore(): Promise<StoreContext | null> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const kind = classifyHost(host, storeBaseDomain());
  if (kind.kind !== "store") return null;
  return getStoreBySlug(kind.slug);
}

export async function requireCurrentStore(): Promise<StoreContext> {
  const store = await getCurrentStore();
  if (!store) throw new DomainError("NO_STORE", "This action is only available on a store.", { status: 404 });
  return store;
}
