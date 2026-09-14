"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { InventoryReason, ProductStatus } from "@/generated/prisma/enums";
import { CATALOG_TAG, productTag } from "@/features/catalog/queries";
import { duplicateProduct, recomputeProductAggregates, removeProduct, saveProduct, setVariantStock } from "@/features/catalog/service";
import { getSearchProvider } from "@/features/search/provider";
import { failure, handleActionError, success, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { productPayloadSchema } from "./schemas";

function revalidateCatalog(slugs: string[] = []) {
  updateTag(CATALOG_TAG);
  for (const slug of slugs) updateTag(productTag(slug));
  revalidatePath("/admin/products");
}

export async function saveProductAction(productId: string | null, payload: unknown): Promise<ActionState<{ id: string; slug: string }>> {
  try {
    const user = await assertPermission(productId ? "products.update" : "products.create");
    const parsed = productPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
      return failure("Please fix the highlighted fields.", fieldErrors);
    }
    const data = parsed.data;
    if (data.variants.some((variant) => Number.isNaN(variant.price))) return failure("Every variant needs a valid price.", { variants: ["Enter a valid price."] });
    const previous = productId ? await db.product.findUnique({ where: { id: productId }, select: { slug: true } }) : null;
    const product = await saveProduct(
      {
        ...data,
        variants: data.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku || null,
          barcode: variant.barcode || null,
          priceCents: variant.price,
          salePriceCents: variant.salePrice ?? null,
          costCents: variant.cost ?? null,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          trackInventory: variant.trackInventory,
          allowBackorder: variant.allowBackorder,
          weightGrams: variant.weightGrams ?? null,
          lengthMm: variant.lengthMm ?? null,
          widthMm: variant.widthMm ?? null,
          heightMm: variant.heightMm ?? null,
          imageMediaId: variant.imageMediaId ?? null,
          optionValueIds: variant.optionValueIds,
          isActive: variant.isActive,
        })),
      },
      { productId: productId ?? undefined, actorId: user.id },
    );
    await writeAudit({ actorId: user.id, action: productId ? "product.update" : "product.create", entityType: "Product", entityId: product.id, summary: `${productId ? "Updated" : "Created"} product “${product.name}”` });
    revalidateCatalog([product.slug, ...(previous?.slug ? [previous.slug] : [])]);
    return success(productId ? "Product saved." : "Product created.", { id: product.id, slug: product.slug });
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteProductAction(productId: string): Promise<ActionState> {
  try {
    const user = await assertPermission("products.delete");
    const product = await db.product.findUnique({ where: { id: productId }, select: { name: true, slug: true } });
    if (!product) return failure("Product not found.");
    const result = await removeProduct(productId);
    await writeAudit({ actorId: user.id, action: result.archived ? "product.archive" : "product.delete", entityType: "Product", entityId: productId, summary: `${result.archived ? "Archived" : "Deleted"} product “${product.name}”` });
    revalidateCatalog([product.slug]);
    return success(result.archived ? "Product archived (it has order history, so it was kept for records)." : "Product deleted.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function duplicateProductAction(productId: string): Promise<ActionState<{ id: string }>> {
  try {
    const user = await assertPermission("products.create");
    const copy = await duplicateProduct(productId, user.id);
    await writeAudit({ actorId: user.id, action: "product.duplicate", entityType: "Product", entityId: copy.id, summary: `Duplicated product into “${copy.name}”` });
    revalidateCatalog();
    return success("Product duplicated as a draft.", { id: copy.id });
  } catch (error) {
    return handleActionError(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Select at least one product."),
  action: z.enum(["publish", "unpublish", "archive", "delete", "feature", "unfeature", "price", "stock"]),
  percent: z.coerce.number().min(-95).max(500).optional(),
  amount: z.coerce.number().min(-100000).max(100000).optional(),
  stock: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export async function bulkProductAction(input: unknown): Promise<ActionState> {
  try {
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid bulk action.");
    const { ids, action } = parsed.data;
    const user = await assertPermission(action === "delete" || action === "archive" ? "products.delete" : action === "stock" ? "inventory.update" : "products.update");
    const products = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } });
    let message = "";
    switch (action) {
      case "publish":
      case "unpublish":
      case "archive": {
        const status = action === "publish" ? ProductStatus.ACTIVE : action === "unpublish" ? ProductStatus.DRAFT : ProductStatus.ARCHIVED;
        await db.product.updateMany({ where: { id: { in: ids } }, data: { status, ...(status === ProductStatus.ACTIVE ? { publishedAt: new Date() } : {}) } });
        for (const product of products) {
          if (status === ProductStatus.ACTIVE) await getSearchProvider().indexProduct(product.id);
          else await getSearchProvider().removeProduct(product.id);
        }
        message = `${products.length} product${products.length === 1 ? "" : "s"} ${action === "publish" ? "published" : action === "unpublish" ? "moved to draft" : "archived"}.`;
        break;
      }
      case "feature":
      case "unfeature":
        await db.product.updateMany({ where: { id: { in: ids } }, data: { isFeatured: action === "feature" } });
        message = `${products.length} product${products.length === 1 ? "" : "s"} ${action === "feature" ? "featured" : "unfeatured"}.`;
        break;
      case "delete": {
        let archived = 0;
        for (const product of products) if ((await removeProduct(product.id)).archived) archived++;
        message = `${products.length - archived} deleted${archived ? `, ${archived} archived (have order history)` : ""}.`;
        break;
      }
      case "price": {
        const percent = parsed.data.percent ?? 0;
        const amountCents = Math.round((parsed.data.amount ?? 0) * 100);
        if (percent === 0 && amountCents === 0) return failure("Enter a percentage or an amount to change prices by.");
        const variants = await db.productVariant.findMany({ where: { productId: { in: ids } } });
        await db.$transaction(
          variants.map((variant) => {
            const next = Math.max(0, Math.round(variant.priceCents * (1 + percent / 100)) + amountCents);
            const sale = variant.salePriceCents !== null ? Math.max(0, Math.round(variant.salePriceCents * (1 + percent / 100)) + amountCents) : null;
            return db.productVariant.update({ where: { id: variant.id }, data: { priceCents: next, salePriceCents: sale !== null && sale < next ? sale : null } });
          }),
        );
        for (const product of products) await recomputeProductAggregates(product.id);
        message = `Prices updated on ${variants.length} variant${variants.length === 1 ? "" : "s"}.`;
        break;
      }
      case "stock": {
        const quantity = parsed.data.stock ?? 0;
        const variants = await db.productVariant.findMany({ where: { productId: { in: ids } }, select: { id: true } });
        await db.$transaction(async (tx) => {
          for (const variant of variants) await setVariantStock(tx, variant.id, quantity, { reason: InventoryReason.BULK_UPDATE, note: "Bulk inventory update", actorId: user.id });
        });
        for (const product of products) await recomputeProductAggregates(product.id);
        message = `Stock set to ${quantity} on ${variants.length} variant${variants.length === 1 ? "" : "s"}.`;
        break;
      }
    }
    await writeAudit({ actorId: user.id, action: `product.bulk_${action}`, entityType: "Product", summary: `${message} (${products.map((product) => product.name).slice(0, 5).join(", ")}${products.length > 5 ? "…" : ""})` });
    revalidateCatalog(products.map((product) => product.slug));
    revalidatePath("/admin/inventory");
    return success(message);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function adjustStockAction(variantId: string, quantity: number, note?: string): Promise<ActionState> {
  try {
    const user = await assertPermission("inventory.update");
    if (!Number.isInteger(quantity) || quantity < 0) return failure("Enter a whole number.");
    const { productId } = await db.$transaction((tx) => setVariantStock(tx, variantId, quantity, { note: note?.trim() || "Adjusted in inventory", actorId: user.id }));
    await recomputeProductAggregates(productId);
    const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
    revalidateCatalog(product ? [product.slug] : []);
    revalidatePath("/admin/inventory");
    revalidatePath("/admin");
    return success("Stock updated.");
  } catch (error) {
    return handleActionError(error);
  }
}
