import type { Metadata } from "next";
import { Suspense } from "react";
import { CouponManager } from "@/components/admin/discounts/coupon-manager";
import { Card, PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Discounts" };

async function Discounts() {
  await requirePagePermission("discounts.manage", "/admin/discounts");
  const [coupons, products, categories] = await Promise.all([
    db.coupon.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { products: true, categories: true, customers: { include: { user: { select: { email: true } } } }, redemptions: { select: { discountCents: true } } } }),
    db.product.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ where: { deletedAt: null }, orderBy: [{ position: "asc" }], select: { id: true, name: true, parent: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Discounts" description="Coupon codes customers enter at checkout. Limits are enforced when the order is placed." />
      <Card padded={false}>
        <CouponManager
          coupons={coupons.map((coupon) => ({
            id: coupon.id,
            code: coupon.code,
            description: coupon.description,
            type: coupon.type,
            value: coupon.value,
            scope: coupon.scope,
            productIds: coupon.products.map((entry) => entry.productId),
            categoryIds: coupon.categories.map((entry) => entry.categoryId),
            customerEmails: coupon.customers.map((entry) => entry.user.email),
            minSubtotalCents: coupon.minSubtotalCents,
            maxDiscountCents: coupon.maxDiscountCents,
            startsAt: coupon.startsAt?.toISOString() ?? null,
            endsAt: coupon.endsAt?.toISOString() ?? null,
            usageLimit: coupon.usageLimit,
            usageLimitPerCustomer: coupon.usageLimitPerCustomer,
            usedCount: coupon.usedCount,
            firstOrderOnly: coupon.firstOrderOnly,
            isActive: coupon.isActive,
            redemptionTotalCents: coupon.redemptions.reduce((sum, redemption) => sum + redemption.discountCents, 0),
          }))}
          options={{ products, categories: categories.map((category) => ({ id: category.id, name: category.parent ? `${category.parent.name} › ${category.name}` : category.name })) }}
        />
      </Card>
    </>
  );
}

export default function DiscountsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Discounts />
    </Suspense>
  );
}
