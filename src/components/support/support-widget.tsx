import { getStoreSettings } from "@/features/settings/queries";
import type { StoreContext } from "@/features/stores/context";
import { countUnreadForCustomer } from "@/features/support/queries";
import { getCurrentUser } from "@/server/auth/session";
import { SupportWidgetPanel } from "./support-widget-panel";

/**
 * The floating customer-service launcher, on the platform site and in every storefront. Messages written
 * here open ordinary support conversations — the store owner and Zendropship staff answer them from the
 * same inbox as any other — so nothing about this widget is a system of its own.
 *
 * It reads the session, so render it inside a Suspense boundary to keep the page shell prerenderable.
 */
export async function SupportWidget({ store, inboxHref }: { store?: StoreContext | null; inboxHref?: string } = {}) {
  const [settings, user] = await Promise.all([getStoreSettings(), getCurrentUser()]);
  const unread = user ? await countUnreadForCustomer(user.id, store?.id ?? null) : 0;
  const inStore = store && !store.isPlatformStore ? store : null;

  return (
    <SupportWidgetPanel
      initialUnread={unread}
      config={{
        answeredBy: inStore?.name ?? settings.store.name,
        phone: settings.store.supportPhone || null,
        hours: settings.store.supportHours || null,
        email: inStore?.supportEmail || settings.store.supportEmail || null,
        // Storefronts and the owner dashboard have a page of their own; elsewhere the panel is the whole thing.
        inboxHref: inboxHref ?? (store ? "/support" : null),
        inStore: Boolean(store),
      }}
    />
  );
}
