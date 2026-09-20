"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { ingestImage } from "@/features/media/service";
import { isValidStoreSlug, storeUrl } from "@/lib/tenancy";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { getCurrentUser, startSession } from "@/server/auth/session";
import { isDomainError } from "@/server/errors";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";
import { getRequestMeta } from "@/server/request";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { assertStoreOwner } from "./guards";
import { openStoreForNewOwner, openStoreForUser } from "./onboarding";
import { storeCatalogTag, storeTag, STORES_TAG } from "./queries";
import { openStoreSchema, openStoreSignedInSchema, storePricingSchema, storeProductPricingSchema, storeSettingsSchema } from "./schemas";
import { addProductsToStore, isStoreSlugAvailable, removeProductFromStore, setStoreStatus, suggestStoreSlug, updateStoreProduct, updateStoreSettings } from "./service";

/** Storefront caches for one store: its record (name, theme, pricing rules) and its shelf. */
function refreshStore(store: { id: string; slug: string }) {
  updateTag(storeTag(store.slug));
  updateTag(storeCatalogTag(store.id));
}

// ─── Opening a store ─────────────────────────────────────────────────────────

export type SlugCheck = { slug: string; url: string; available: boolean; message: string | null };

/** Live preview of the store address while the owner types a name or edits the address. */
export async function checkStoreSlugAction(input: { name?: string; slug?: string }): Promise<SlugCheck> {
  const requested = typeof input?.slug === "string" ? input.slug.trim().toLowerCase().slice(0, 40) : "";
  const name = typeof input?.name === "string" ? input.name.slice(0, 60) : "";
  if (requested) {
    if (!isValidStoreSlug(requested)) return { slug: requested, url: storeUrl(requested), available: false, message: "Use 3–30 lower-case letters, digits and single hyphens." };
    const available = await isStoreSlugAvailable(requested);
    return { slug: requested, url: storeUrl(requested), available, message: available ? null : "That address is taken — try another." };
  }
  if (name.trim().length < 2) return { slug: "", url: "", available: false, message: null };
  const slug = await suggestStoreSlug(name).catch(() => "");
  return { slug, url: slug ? storeUrl(slug) : "", available: !!slug, message: slug ? null : "Try a different store name." };
}

export async function openStoreAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const meta = await getRequestMeta();
  const limit = await rateLimit("register", meta.ipAddress);
  if (!limit.success) return failure(retryAfterMessage(limit.resetAt));

  const current = await getCurrentUser();
  // A product chosen in the catalogue before the visitor had a store is added as soon as the store exists.
  const pending = typeof formData.get("add") === "string" ? String(formData.get("add")).slice(0, 40) : "";
  try {
    let opened: { storeId: string; ownerId: string };
    if (current) {
      const parsed = openStoreSignedInSchema.safeParse({ storeName: formData.get("storeName"), slug: formData.get("slug") ?? undefined });
      if (!parsed.success) return zodFailure(parsed.error);
      const store = await openStoreForUser(current.id, parsed.data);
      opened = { storeId: store.id, ownerId: current.id };
    } else {
      const parsed = openStoreSchema.safeParse({
        storeName: formData.get("storeName"),
        slug: formData.get("slug") ?? undefined,
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
        email: formData.get("email"),
        password: formData.get("password"),
      });
      if (!parsed.success) return zodFailure(parsed.error);
      const { user, store, verificationToken } = await openStoreForNewOwner(parsed.data, { ipAddress: meta.ipAddress });
      opened = { storeId: store.id, ownerId: user.id };
      await startSession(user.id, meta);
      after(async () => {
        try {
          await sendDeliveries(await dispatchNotification({ type: "user.registered", userId: user.id, verificationToken, storeId: null }));
        } catch (error) {
          console.error("[stores] welcome email failed", error);
        }
      });
    }
    if (pending) await addProductsToStore(opened.storeId, [pending], { userId: opened.ownerId, asOwner: true }).catch(() => undefined);
  } catch (error) {
    return handleActionError(error);
  }
  updateTag(STORES_TAG);
  revalidatePath("/", "layout");
  redirect("/dashboard?welcome=1");
}

// ─── Products ────────────────────────────────────────────────────────────────

export type AddToStoreResult = { ok: true; added: number; message: string } | { ok: false; error: string; reason?: "signin" | "no-store" };

const productIdsSchema = z.array(z.string().min(1).max(40)).min(1).max(200);

/** "Add to my store" from the platform catalogue. */
export async function addToMyStoreAction(productIds: string[]): Promise<AddToStoreResult> {
  const parsed = productIdsSchema.safeParse(productIds);
  if (!parsed.success) return { ok: false, error: "Choose at least one product." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in or open a store to add products.", reason: "signin" };
  try {
    const { store } = await assertStoreOwner();
    const { added } = await addProductsToStore(store.id, parsed.data, { userId: user.id, asOwner: true });
    refreshStore(store);
    revalidatePath("/dashboard/products");
    return { ok: true, added, message: added === 0 ? "Already in your store." : added === 1 ? "Added to your store." : `${added} products added to your store.` };
  } catch (error) {
    if (isDomainError(error) && error.message === "Open a store first.") return { ok: false, error: "Open your store first — it takes a minute.", reason: "no-store" };
    if (isDomainError(error)) return { ok: false, error: error.message };
    console.error("[stores] add to store failed", error);
    return { ok: false, error: "We couldn't add that product. Please try again." };
  }
}

export async function removeFromMyStoreAction(productId: string): Promise<ActionState> {
  try {
    const { user, store } = await assertStoreOwner();
    await removeProductFromStore(store.id, String(productId).slice(0, 40), { userId: user.id, asOwner: true });
    refreshStore(store);
    revalidatePath("/dashboard/products");
    return success("Removed from your store.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setStoreProductVisibilityAction(productId: string, isActive: boolean): Promise<ActionState> {
  try {
    const { user, store } = await assertStoreOwner();
    await updateStoreProduct(store.id, String(productId).slice(0, 40), { isActive: !!isActive }, { userId: user.id, asOwner: true });
    refreshStore(store);
    revalidatePath("/dashboard/products");
    return success(isActive ? "Product is live in your store." : "Product hidden from your store.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function saveStoreProductPricingAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = storeProductPricingSchema.safeParse({ productId: formData.get("productId"), markupPercent: formData.get("markupPercent") ?? undefined, fixedPrice: formData.get("fixedPrice") ?? undefined });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const { user, store } = await assertStoreOwner();
    await updateStoreProduct(
      store.id,
      parsed.data.productId,
      { markupBps: parsed.data.markupPercent === null ? null : Math.round(parsed.data.markupPercent * 100), fixedPriceCents: parsed.data.fixedPrice },
      { userId: user.id, asOwner: true },
    );
    refreshStore(store);
    revalidatePath("/dashboard/products");
    return success("Price saved.");
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function saveStoreSettingsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = storeSettingsSchema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline") ?? undefined,
    aboutText: formData.get("aboutText") ?? undefined,
    supportEmail: formData.get("supportEmail") ?? undefined,
    announcement: formData.get("announcement") ?? undefined,
    heroTitle: formData.get("heroTitle") ?? undefined,
    heroSubtitle: formData.get("heroSubtitle") ?? undefined,
    accentColor: formData.get("accentColor"),
  });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const { user, store } = await assertStoreOwner();
    await updateStoreSettings(store.id, parsed.data, { userId: user.id, asOwner: true });
    refreshStore(store);
    revalidatePath("/dashboard", "layout");
    return success("Store settings saved.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function saveStorePricingAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = storePricingSchema.safeParse({ pricingMode: formData.get("pricingMode"), markupPercent: formData.get("markupPercent") || 0 });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const { user, store } = await assertStoreOwner();
    await updateStoreSettings(store.id, { pricingMode: parsed.data.pricingMode, markupBps: Math.round(parsed.data.markupPercent * 100) }, { userId: user.id, asOwner: true });
    refreshStore(store);
    revalidatePath("/dashboard", "layout");
    return success("Pricing saved. Your store shows the new prices now.");
  } catch (error) {
    return handleActionError(error);
  }
}

const imageKindSchema = z.enum(["logo", "hero"]);

/** Uploads the store logo or homepage image (validated and re-encoded like every other upload). */
export async function uploadStoreImageAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const kind = imageKindSchema.safeParse(formData.get("kind"));
  const file = formData.get("file");
  if (!kind.success) return failure("Unknown image type.");
  if (!(file instanceof File) || file.size === 0) return failure("Choose an image to upload.", { file: ["Choose an image to upload."] });
  try {
    const { user, store } = await assertStoreOwner();
    const limit = await rateLimit("upload", user.id);
    if (!limit.success) return failure(retryAfterMessage(limit.resetAt));
    const asset = await ingestImage({
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      folder: "stores",
      alt: kind.data === "logo" ? `${store.name} logo` : store.name,
      uploadedById: user.id,
      maxDimension: kind.data === "logo" ? 800 : 2400,
    });
    await updateStoreSettings(store.id, kind.data === "logo" ? { logoId: asset.id } : { heroImageId: asset.id }, { userId: user.id, asOwner: true });
    refreshStore(store);
    revalidatePath("/dashboard", "layout");
    return success(kind.data === "logo" ? "Logo updated." : "Homepage image updated.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function removeStoreImageAction(kind: "logo" | "hero"): Promise<ActionState> {
  const parsed = imageKindSchema.safeParse(kind);
  if (!parsed.success) return failure("Unknown image type.");
  try {
    const { user, store } = await assertStoreOwner();
    await updateStoreSettings(store.id, parsed.data === "logo" ? { logoId: null } : { heroImageId: null }, { userId: user.id, asOwner: true });
    refreshStore(store);
    revalidatePath("/dashboard", "layout");
    return success(parsed.data === "logo" ? "Logo removed." : "Homepage image removed.");
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function setStoreStatusAction(storeId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    if (status !== "ACTIVE" && status !== "SUSPENDED") return failure("Unknown status.");
    const store = await setStoreStatus(String(storeId).slice(0, 40), status, admin.id);
    refreshStore(store);
    updateTag(STORES_TAG);
    revalidatePath("/admin/stores");
    return success(status === "SUSPENDED" ? `${store.name} is suspended and no longer visible to shoppers.` : `${store.name} is open again.`);
  } catch (error) {
    return handleActionError(error);
  }
}
