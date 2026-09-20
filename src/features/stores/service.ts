import { Prisma } from "@/generated/prisma/client";
import { ProductStatus, StoreStatus } from "@/generated/prisma/enums";
import { isValidStoreSlug, slugFromStoreName } from "@/lib/tenancy";
import { writeAudit } from "@/server/audit";
import { db, type DbClient } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

export const MAX_STORE_PRODUCTS = 2000;

export class StoreError extends DomainError {}

/** Store names allowed in the header and on the subdomain form. */
export const STORE_NAME_MIN = 2;
export const STORE_NAME_MAX = 60;

/** A free, valid slug for a new store: the name's slug, then name-2, name-3… */
export async function suggestStoreSlug(name: string, client: DbClient = db): Promise<string> {
  let base = slugFromStoreName(name);
  if (base.length < 3) base = `${base}-store`.replace(/^-/, "");
  if (!isValidStoreSlug(base)) base = `${base}-store`;
  for (let attempt = 1; attempt < 100; attempt++) {
    const candidate = attempt === 1 ? base : `${base.slice(0, 30 - String(attempt).length - 1)}-${attempt}`;
    if (!isValidStoreSlug(candidate)) continue;
    if (!(await client.store.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  throw new StoreError("SLUG_UNAVAILABLE", "We could not find a free address for that name. Try a different store name.");
}

export async function isStoreSlugAvailable(slug: string, client: DbClient = db) {
  if (!isValidStoreSlug(slug)) return false;
  return !(await client.store.findUnique({ where: { slug }, select: { id: true } }));
}

export type CreateStoreInput = { ownerId: string | null; name: string; slug?: string; tagline?: string | null; supportEmail?: string | null };

/** Opens a store. Owners get exactly one store; the platform's own demo store has no owner. */
export async function createStore(input: CreateStoreInput, client: DbClient = db) {
  const name = input.name.trim();
  if (name.length < STORE_NAME_MIN || name.length > STORE_NAME_MAX) {
    throw new StoreError("STORE_NAME_INVALID", `Store names are ${STORE_NAME_MIN}–${STORE_NAME_MAX} characters.`, { fieldErrors: { storeName: ["Choose a name between 2 and 60 characters."] } });
  }
  if (input.ownerId && (await client.store.findFirst({ where: { ownerId: input.ownerId, deletedAt: null }, select: { id: true } }))) {
    throw new StoreError("STORE_EXISTS", "You already have a store.");
  }
  const slug = input.slug ? input.slug.trim().toLowerCase() : await suggestStoreSlug(name, client);
  if (!isValidStoreSlug(slug)) {
    throw new StoreError("SLUG_INVALID", "Store addresses use 3–30 lower-case letters, digits and hyphens, and cannot be a reserved word.", { fieldErrors: { slug: ["Use 3–30 lower-case letters, digits and hyphens."] } });
  }
  if (!(await isStoreSlugAvailable(slug, client))) {
    throw new StoreError("SLUG_TAKEN", "That store address is already taken.", { fieldErrors: { slug: ["That address is taken — try another."] } });
  }
  const store = await client.store.create({
    data: {
      name,
      slug,
      ownerId: input.ownerId,
      status: StoreStatus.ACTIVE,
      tagline: input.tagline?.trim() || null,
      supportEmail: input.supportEmail?.trim().toLowerCase() || null,
      heroTitle: name,
      heroSubtitle: input.tagline?.trim() || null,
    },
  });
  await writeAudit({ actorId: input.ownerId, action: "store.create", entityType: "Store", entityId: store.id, summary: `Store "${name}" opened at ${slug}` }, client);
  return store;
}

async function ownedStore(storeId: string, ownerId: string | null, client: DbClient) {
  const store = await client.store.findFirst({ where: { id: storeId, deletedAt: null, ...(ownerId ? { ownerId } : {}) }, select: { id: true, slug: true, status: true } });
  if (!store) throw new NotFoundError("Store not found.");
  if (store.status === StoreStatus.SUSPENDED) throw new StoreError("STORE_SUSPENDED", "This store is suspended. Contact support.");
  return store;
}

/** Adds catalogue products to a store ("Add to my store"). Existing entries are re-activated. Returns the number newly added. */
export async function addProductsToStore(storeId: string, productIds: string[], actor: { userId: string | null; asOwner: boolean }) {
  const ids = [...new Set(productIds)].slice(0, 200);
  if (ids.length === 0) return { added: 0, slug: "" };
  const store = await ownedStore(storeId, actor.asOwner ? actor.userId : null, db);
  const products = await db.product.findMany({ where: { id: { in: ids }, status: ProductStatus.ACTIVE, deletedAt: null }, select: { id: true } });
  if (products.length === 0) throw new NotFoundError("Those products are not available to sell.");

  return db.$transaction(async (tx) => {
    const count = await tx.storeProduct.count({ where: { storeId } });
    const existing = await tx.storeProduct.findMany({ where: { storeId, productId: { in: products.map((product) => product.id) } }, select: { productId: true, isActive: true } });
    const known = new Map(existing.map((row) => [row.productId, row.isActive]));
    const fresh = products.filter((product) => !known.has(product.id));
    if (count + fresh.length > MAX_STORE_PRODUCTS) throw new StoreError("STORE_FULL", `A store can list up to ${MAX_STORE_PRODUCTS} products.`);
    const position = await tx.storeProduct.aggregate({ where: { storeId }, _max: { position: true } });
    let next = (position._max.position ?? 0) + 1;
    if (fresh.length) {
      await tx.storeProduct.createMany({ data: fresh.map((product) => ({ storeId, productId: product.id, position: next++ })), skipDuplicates: true });
    }
    const dormant = existing.filter((row) => !row.isActive).map((row) => row.productId);
    if (dormant.length) await tx.storeProduct.updateMany({ where: { storeId, productId: { in: dormant } }, data: { isActive: true } });
    await writeAudit({ actorId: actor.userId, action: "store.products.add", entityType: "Store", entityId: storeId, summary: `Added ${fresh.length + dormant.length} product(s) to the store` }, tx);
    return { added: fresh.length + dormant.length, slug: store.slug };
  });
}

export async function removeProductFromStore(storeId: string, productId: string, actor: { userId: string | null; asOwner: boolean }) {
  const store = await ownedStore(storeId, actor.asOwner ? actor.userId : null, db);
  const removed = await db.storeProduct.deleteMany({ where: { storeId, productId } });
  if (removed.count === 0) throw new NotFoundError("That product is not in your store.");
  await writeAudit({ actorId: actor.userId, action: "store.products.remove", entityType: "Store", entityId: storeId, summary: "Removed a product from the store" });
  return { slug: store.slug };
}

export type StoreProductPricingInput = { isActive?: boolean; markupBps?: number | null; fixedPriceCents?: number | null };

export async function updateStoreProduct(storeId: string, productId: string, input: StoreProductPricingInput, actor: { userId: string | null; asOwner: boolean }) {
  const store = await ownedStore(storeId, actor.asOwner ? actor.userId : null, db);
  if (input.markupBps != null && (input.markupBps < 0 || input.markupBps > 100_000)) throw new StoreError("MARKUP_INVALID", "Markup must be between 0% and 1000%.");
  if (input.fixedPriceCents != null && (input.fixedPriceCents < 0 || input.fixedPriceCents > 100_000_000)) throw new StoreError("PRICE_INVALID", "Enter a valid price.");
  const data: Prisma.StoreProductUpdateManyMutationInput = {};
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.markupBps !== undefined) data.markupBps = input.markupBps;
  if (input.fixedPriceCents !== undefined) data.fixedPriceCents = input.fixedPriceCents;
  const updated = await db.storeProduct.updateMany({ where: { storeId, productId }, data });
  if (updated.count === 0) throw new NotFoundError("That product is not in your store.");
  return { slug: store.slug };
}

export type StoreSettingsInput = {
  name?: string;
  tagline?: string | null;
  aboutText?: string | null;
  supportEmail?: string | null;
  announcement?: string | null;
  accentColor?: string;
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  logoId?: string | null;
  heroImageId?: string | null;
  pricingMode?: "SUGGESTED" | "MARKUP";
  markupBps?: number;
};

export async function updateStoreSettings(storeId: string, input: StoreSettingsInput, actor: { userId: string | null; asOwner: boolean }) {
  const store = await ownedStore(storeId, actor.asOwner ? actor.userId : null, db);
  if (input.name !== undefined && (input.name.trim().length < STORE_NAME_MIN || input.name.trim().length > STORE_NAME_MAX)) {
    throw new StoreError("STORE_NAME_INVALID", `Store names are ${STORE_NAME_MIN}–${STORE_NAME_MAX} characters.`, { fieldErrors: { name: ["Choose a name between 2 and 60 characters."] } });
  }
  if (input.markupBps !== undefined && (input.markupBps < 0 || input.markupBps > 100_000)) {
    throw new StoreError("MARKUP_INVALID", "Markup must be between 0% and 1000%.", { fieldErrors: { markupPercent: ["Enter a markup between 0 and 1000."] } });
  }
  if (input.accentColor !== undefined && !/^#[0-9a-f]{6}$/i.test(input.accentColor)) {
    throw new StoreError("COLOR_INVALID", "Accent colour must be a hex colour like #5446ff.", { fieldErrors: { accentColor: ["Use a hex colour like #5446ff."] } });
  }
  const trimmed = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);
  const updated = await db.store.update({
    where: { id: store.id },
    data: {
      name: input.name?.trim(),
      tagline: trimmed(input.tagline),
      aboutText: trimmed(input.aboutText),
      supportEmail: trimmed(input.supportEmail)?.toLowerCase(),
      announcement: trimmed(input.announcement),
      accentColor: input.accentColor?.toLowerCase(),
      heroTitle: trimmed(input.heroTitle),
      heroSubtitle: trimmed(input.heroSubtitle),
      logoId: input.logoId,
      heroImageId: input.heroImageId,
      pricingMode: input.pricingMode,
      markupBps: input.markupBps,
    },
  });
  await writeAudit({ actorId: actor.userId, action: "store.settings.update", entityType: "Store", entityId: store.id, summary: "Store settings updated" });
  return updated;
}

/** Admin only: suspend or reopen a store. */
export async function setStoreStatus(storeId: string, status: StoreStatus, actorId: string | null) {
  const store = await db.store.findFirst({ where: { id: storeId, deletedAt: null }, select: { id: true, slug: true, name: true } });
  if (!store) throw new NotFoundError("Store not found.");
  await db.store.update({ where: { id: store.id }, data: { status } });
  await writeAudit({ actorId, action: "store.status", entityType: "Store", entityId: store.id, summary: `Store "${store.name}" set to ${status}` });
  return store;
}
