import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type AuthUser } from "@/server/auth/session";
import { PermissionError } from "@/server/errors";
import { getOwnedStore } from "./queries";

export type OwnedStore = NonNullable<Awaited<ReturnType<typeof getOwnedStore>>>;

/** Dashboard pages: sign in first; signed-in users without a store are sent to open one. */
export async function requireStoreOwner(returnTo = "/dashboard"): Promise<{ user: AuthUser; store: OwnedStore }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  const store = await getOwnedStore(user.id);
  if (!store) redirect("/start");
  return { user, store };
}

/** Server actions: the signed-in user's store, or a PermissionError. */
export async function assertStoreOwner(): Promise<{ user: AuthUser; store: OwnedStore }> {
  const user = await getCurrentUser();
  if (!user) throw new PermissionError("Please sign in to manage your store.");
  const store = await getOwnedStore(user.id);
  if (!store) throw new PermissionError("Open a store first.");
  if (store.status === "SUSPENDED") throw new PermissionError("Your store is suspended. Contact Zendropship support.");
  return { user, store };
}
