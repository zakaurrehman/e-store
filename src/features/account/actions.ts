"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { profileSchema } from "@/features/auth/schemas";
import { addressSchema, checkAddressPhone, normaliseAddressPhone } from "@/features/checkout/schemas";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertSignedIn } from "@/server/auth/guards";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";

export async function updateProfileAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertSignedIn();
    const parsed = profileSchema.safeParse({ firstName: formData.get("firstName"), lastName: formData.get("lastName"), phone: formData.get("phone") ?? undefined, marketingOptIn: formData.get("marketingOptIn") ?? undefined });
    if (!parsed.success) return zodFailure(parsed.error);
    await db.user.update({ where: { id: user.id }, data: parsed.data });
    if (parsed.data.marketingOptIn) {
      await db.newsletterSubscriber.upsert({ where: { email: user.email }, create: { email: user.email, source: "account" }, update: { unsubscribedAt: null } });
    } else {
      await db.newsletterSubscriber.updateMany({ where: { email: user.email, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
    }
    revalidatePath("/account", "layout");
    return success("Profile updated.");
  } catch (error) {
    return handleActionError(error);
  }
}

const addressFormSchema = addressSchema
  .extend({
    id: z.string().max(40).optional(),
    label: z.string().trim().max(40).optional().transform((value) => value || null),
    isDefaultShipping: z.union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()]).transform((value) => value === "on" || value === "true"),
  })
  // Same phone rules as checkout: a real, dialable number, stored in international form.
  .superRefine(checkAddressPhone)
  .transform(normaliseAddressPhone);

export async function saveAddressAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertSignedIn();
    const raw = Object.fromEntries(formData.entries());
    const parsed = addressFormSchema.safeParse({ ...raw, id: raw.id || undefined, isDefaultShipping: raw.isDefaultShipping ?? undefined });
    if (!parsed.success) return zodFailure(parsed.error);
    const { id, isDefaultShipping, ...data } = parsed.data;
    const count = await db.address.count({ where: { userId: user.id, deletedAt: null } });
    const makeDefault = isDefaultShipping || count === 0;
    await db.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefaultShipping: false, isDefaultBilling: false } });
      if (id) {
        const existing = await tx.address.findFirst({ where: { id, userId: user.id, deletedAt: null } });
        if (!existing) throw new NotFoundError("Address not found.");
        await tx.address.update({ where: { id }, data: { ...data, isDefaultShipping: makeDefault || existing.isDefaultShipping, isDefaultBilling: makeDefault || existing.isDefaultBilling } });
      } else {
        await tx.address.create({ data: { ...data, userId: user.id, isDefaultShipping: makeDefault, isDefaultBilling: makeDefault } });
      }
    });
    revalidatePath("/account/addresses");
    return success(id ? "Address updated." : "Address added.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteAddressAction(id: string): Promise<ActionState> {
  try {
    const user = await assertSignedIn();
    const address = await db.address.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!address) return failure("Address not found.");
    await db.address.update({ where: { id }, data: { deletedAt: new Date(), isDefaultShipping: false, isDefaultBilling: false } });
    if (address.isDefaultShipping) {
      const next = await db.address.findFirst({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "asc" } });
      if (next) await db.address.update({ where: { id: next.id }, data: { isDefaultShipping: true, isDefaultBilling: true } });
    }
    revalidatePath("/account/addresses");
    return success("Address removed.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setDefaultAddressAction(id: string): Promise<ActionState> {
  try {
    const user = await assertSignedIn();
    const address = await db.address.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!address) return failure("Address not found.");
    await db.$transaction([
      db.address.updateMany({ where: { userId: user.id }, data: { isDefaultShipping: false, isDefaultBilling: false } }),
      db.address.update({ where: { id }, data: { isDefaultShipping: true, isDefaultBilling: true } }),
    ]);
    revalidatePath("/account/addresses");
    return success("Default address updated.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionState> {
  try {
    const user = await assertSignedIn();
    await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids?.length ? { id: { in: ids.slice(0, 100) } } : {}) }, data: { readAt: new Date() } });
    revalidatePath("/account", "layout");
    return success();
  } catch (error) {
    return handleActionError(error);
  }
}

export async function removeWishlistItemAction(productId: string): Promise<ActionState> {
  try {
    const user = await assertSignedIn();
    await db.wishlistItem.deleteMany({ where: { productId, wishlist: { userId: user.id } } });
    revalidatePath("/account/wishlist");
    revalidatePath("/wishlist");
    return success("Removed from your wishlist.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function signOutOtherSessionsAction(): Promise<ActionState> {
  try {
    const user = await assertSignedIn();
    const result = await db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
    await writeAudit({ actorId: user.id, action: "user.sessions_revoked", entityType: "User", entityId: user.id, summary: `Signed out ${result.count} other session(s)` });
    revalidatePath("/account/security");
    return success(result.count === 0 ? "No other devices were signed in." : `Signed out ${result.count} other device${result.count === 1 ? "" : "s"}.`);
  } catch (error) {
    return handleActionError(error);
  }
}
