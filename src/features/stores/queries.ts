import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { StoreStatus } from "@/generated/prisma/enums";
import { storeUrl } from "@/lib/tenancy";
import { db } from "@/server/db";
import type { StoreContext } from "./context";

export const STORES_TAG = "stores";
/** Tags the store's own record (name, theme, pricing rules), by slug. */
export const storeTag = (slug: string) => `store:${slug}`;
/** Tags everything in the catalogue scoped to one store (its shelf and prices), by store id. */
export const storeCatalogTag = (storeId: string) => `store-catalog:${storeId}`;

const storeSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  ownerId: true,
  pricingMode: true,
  markupBps: true,
  currency: true,
  tagline: true,
  announcement: true,
  aboutText: true,
  supportEmail: true,
  accentColor: true,
  heroTitle: true,
  heroSubtitle: true,
  logo: { select: { url: true } },
  heroImage: { select: { url: true } },
} satisfies Prisma.StoreSelect;

type StoreRow = Prisma.StoreGetPayload<{ select: typeof storeSelect }>;

export function toStoreContext(row: StoreRow): StoreContext {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    announcement: row.announcement,
    aboutText: row.aboutText,
    supportEmail: row.supportEmail,
    accentColor: row.accentColor,
    logoUrl: row.logo?.url ?? null,
    heroImageUrl: row.heroImage?.url ?? null,
    heroTitle: row.heroTitle,
    heroSubtitle: row.heroSubtitle,
    currency: row.currency,
    pricing: { mode: row.pricingMode, markupBps: row.markupBps },
    url: storeUrl(row.slug),
    isPlatformStore: row.ownerId === null,
  };
}

/** A live store by subdomain slug; null when it does not exist or is not open to shoppers. */
export async function getStoreBySlug(slug: string): Promise<StoreContext | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(STORES_TAG, storeTag(slug));
  const row = await db.store.findFirst({ where: { slug, status: StoreStatus.ACTIVE, deletedAt: null }, select: storeSelect });
  return row ? toStoreContext(row) : null;
}

/** The platform-run demo store: the only one guaranteed to exist. */
export async function getPlatformStore(): Promise<StoreContext> {
  "use cache";
  cacheLife("hours");
  cacheTag(STORES_TAG);
  const row = await db.store.findFirst({ where: { ownerId: null, deletedAt: null }, orderBy: { createdAt: "asc" }, select: storeSelect });
  if (!row) throw new Error("No platform store exists — run the database seed.");
  return toStoreContext(row);
}

/** Uncached: the owner dashboard reads the store it is editing fresh on every request. */
export async function getOwnedStore(ownerId: string) {
  return db.store.findFirst({ where: { ownerId, deletedAt: null }, include: { logo: { select: { id: true, url: true } }, heroImage: { select: { id: true, url: true } } } });
}

/** Product ids on a store's shelf (active or hidden) — marks "In your store" on the platform catalogue. */
export async function getShelfProductIds(storeId: string) {
  const rows = await db.storeProduct.findMany({ where: { storeId }, select: { productId: true } });
  return rows.map((row) => row.productId);
}
