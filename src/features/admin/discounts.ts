"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CouponScope, DiscountType } from "@/generated/prisma/enums";
import { normaliseCouponCode } from "@/features/checkout/coupons";
import { failure, handleActionError, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { parseMoneyToCents } from "@/utils/money";

const bool = z.union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()]).transform((value) => value === "on" || value === "true");
const optionalInt = z.string().trim().optional().transform((value) => (value ? Number.parseInt(value, 10) : null)).refine((value) => value === null || (Number.isInteger(value) && value >= 0), "Enter a whole number.");
const optionalDate = z.string().trim().optional().transform((value) => (value ? new Date(value) : null)).refine((value) => value === null || !Number.isNaN(value.getTime()), "Enter a valid date.");
const list = z.string().optional().transform((value) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean));

const couponSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(3, "Code must be at least 3 characters.").max(40).transform(normaliseCouponCode),
  description: z.string().trim().max(200).optional().transform((value) => value || null),
  type: z.enum(DiscountType),
  value: z.string().trim(),
  scope: z.enum(CouponScope),
  productIds: list,
  categoryIds: list,
  customerEmails: list,
  minSubtotal: z.string().trim().optional(),
  maxDiscount: z.string().trim().optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
  usageLimit: optionalInt,
  usageLimitPerCustomer: optionalInt,
  firstOrderOnly: bool,
  isActive: bool,
});

export async function saveCouponAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("discounts.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = couponSchema.safeParse({ ...raw, id: raw.id || undefined, firstOrderOnly: raw.firstOrderOnly ?? undefined, isActive: raw.isActive ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const data = parsed.data;
    let value: number;
    if (data.type === "PERCENTAGE") {
      value = Number(data.value);
      if (!Number.isInteger(value) || value < 1 || value > 100) return failure("Percentage must be a whole number between 1 and 100.", { value: ["1–100"] });
    } else if (data.type === "FIXED_AMOUNT") {
      const cents = parseMoneyToCents(data.value);
      if (cents === null || cents <= 0) return failure("Enter the discount amount.", { value: ["Enter an amount."] });
      value = cents;
    } else value = 0;
    if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) return failure("End date must be after the start date.");
    const minSubtotalCents = data.minSubtotal ? parseMoneyToCents(data.minSubtotal) : null;
    const maxDiscountCents = data.maxDiscount ? parseMoneyToCents(data.maxDiscount) : null;
    const clash = await db.coupon.findUnique({ where: { code: data.code }, select: { id: true } });
    if (clash && clash.id !== data.id) return failure("That code is already in use.", { code: ["Already in use."] });
    const customers = data.customerEmails.length ? await db.user.findMany({ where: { email: { in: data.customerEmails.map((email) => email.toLowerCase()) } }, select: { id: true, email: true } }) : [];
    const unknown = data.customerEmails.filter((email) => !customers.some((customer) => customer.email === email.toLowerCase()));
    if (unknown.length) return failure(`No customer account for: ${unknown.join(", ")}`);

    const payload = {
      code: data.code,
      description: data.description,
      type: data.type,
      value,
      scope: data.scope,
      minSubtotalCents,
      maxDiscountCents,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      usageLimit: data.usageLimit,
      usageLimitPerCustomer: data.usageLimitPerCustomer,
      firstOrderOnly: data.firstOrderOnly,
      isActive: data.isActive,
    };
    const coupon = await db.$transaction(async (tx) => {
      const saved = data.id ? await tx.coupon.update({ where: { id: data.id }, data: payload }) : await tx.coupon.create({ data: payload });
      await tx.couponProduct.deleteMany({ where: { couponId: saved.id } });
      await tx.couponCategory.deleteMany({ where: { couponId: saved.id } });
      await tx.couponCustomer.deleteMany({ where: { couponId: saved.id } });
      if (data.scope === "PRODUCTS" && data.productIds.length) await tx.couponProduct.createMany({ data: data.productIds.map((productId) => ({ couponId: saved.id, productId })), skipDuplicates: true });
      if (data.scope === "CATEGORIES" && data.categoryIds.length) await tx.couponCategory.createMany({ data: data.categoryIds.map((categoryId) => ({ couponId: saved.id, categoryId })), skipDuplicates: true });
      if (customers.length) await tx.couponCustomer.createMany({ data: customers.map((customer) => ({ couponId: saved.id, userId: customer.id })), skipDuplicates: true });
      return saved;
    });
    await writeAudit({ actorId: user.id, action: data.id ? "coupon.update" : "coupon.create", entityType: "Coupon", entityId: coupon.id, summary: `${data.id ? "Updated" : "Created"} coupon ${coupon.code}` });
    revalidatePath("/admin/discounts");
    return { status: "success", message: data.id ? "Coupon saved." : "Coupon created." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteCouponAction(id: string): Promise<ActionState> {
  try {
    const user = await assertPermission("discounts.manage");
    const coupon = await db.coupon.findUnique({ where: { id }, select: { code: true } });
    if (!coupon) return failure("Coupon not found.");
    await db.coupon.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await writeAudit({ actorId: user.id, action: "coupon.delete", entityType: "Coupon", entityId: id, summary: `Deleted coupon ${coupon.code}` });
    revalidatePath("/admin/discounts");
    return { status: "success", message: "Coupon deleted." };
  } catch (error) {
    return handleActionError(error);
  }
}
