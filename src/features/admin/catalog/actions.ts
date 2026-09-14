"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { AttributeType, CollectionRule } from "@/generated/prisma/enums";
import { CATALOG_TAG } from "@/features/catalog/queries";
import { failure, handleActionError, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { slugify, uniqueSlug } from "@/utils/slug";

function done(message: string): ActionState {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/catalog");
  return { status: "success", message };
}

const bool = z.union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined(), z.boolean()]).transform((value) => value === "on" || value === "true" || value === true);
const optional = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

// ─── Categories ──────────────────────────────────────────────────────────────

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Enter a name.").max(80),
  slug: z.string().trim().max(120).optional(),
  parentId: z.string().optional().transform((value) => value || null),
  description: optional(500),
  imageId: z.string().optional().transform((value) => value || null),
  isActive: bool,
  showInNav: bool,
  seoTitle: optional(120),
  seoDescription: optional(320),
});

export async function saveCategoryAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("catalog.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = categorySchema.safeParse({ ...raw, id: raw.id || undefined, isActive: raw.isActive ?? undefined, showInNav: raw.showInNav ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, ...data } = parsed.data;
    if (id && data.parentId === id) return failure("A category can't be its own parent.");
    const slug = await uniqueSlug(data.slug || data.name, async (candidate) => {
      const clash = await db.category.findUnique({ where: { slug: candidate }, select: { id: true } });
      return !!clash && clash.id !== id;
    });
    if (id) await db.category.update({ where: { id }, data: { ...data, slug } });
    else {
      const position = await db.category.count({ where: { parentId: data.parentId } });
      await db.category.create({ data: { ...data, slug, position } });
    }
    await writeAudit({ actorId: user.id, action: id ? "category.update" : "category.create", entityType: "Category", entityId: id, summary: `${id ? "Updated" : "Created"} category “${data.name}”` });
    return done(id ? "Category saved." : "Category created.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionState> {
  try {
    const user = await assertPermission("catalog.manage");
    const category = await db.category.findUnique({ where: { id }, include: { _count: { select: { children: true, products: true } } } });
    if (!category) return failure("Category not found.");
    if (category._count.children > 0) return failure("Move or delete its subcategories first.");
    await db.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await writeAudit({ actorId: user.id, action: "category.delete", entityType: "Category", entityId: id, summary: `Deleted category “${category.name}” (${category._count.products} products unlinked from navigation)` });
    return done("Category deleted.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Persists drag-and-drop ordering: an ordered list of ids under the same parent. */
export async function reorderAction(entity: "category" | "brand" | "collection" | "attribute", ids: string[]): Promise<ActionState> {
  try {
    await assertPermission("catalog.manage");
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) return failure("Nothing to reorder.");
    await db.$transaction(
      ids.map((id, position) =>
        entity === "category" ? db.category.update({ where: { id }, data: { position } }) : entity === "brand" ? db.brand.update({ where: { id }, data: { position } }) : entity === "collection" ? db.collection.update({ where: { id }, data: { position } }) : db.attribute.update({ where: { id }, data: { position } }),
      ),
    );
    return done("Order saved.");
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Brands ──────────────────────────────────────────────────────────────────

const brandSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Enter a name.").max(80), slug: z.string().trim().max(120).optional(), description: optional(500), story: optional(4000), website: optional(200), logoId: z.string().optional().transform((value) => value || null), isActive: bool, isFeatured: bool, seoTitle: optional(120), seoDescription: optional(320) });

export async function saveBrandAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("catalog.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = brandSchema.safeParse({ ...raw, id: raw.id || undefined, isActive: raw.isActive ?? undefined, isFeatured: raw.isFeatured ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, ...data } = parsed.data;
    const slug = await uniqueSlug(data.slug || data.name, async (candidate) => {
      const clash = await db.brand.findUnique({ where: { slug: candidate }, select: { id: true } });
      return !!clash && clash.id !== id;
    });
    if (id) await db.brand.update({ where: { id }, data: { ...data, slug } });
    else await db.brand.create({ data: { ...data, slug, position: await db.brand.count() } });
    await writeAudit({ actorId: user.id, action: id ? "brand.update" : "brand.create", entityType: "Brand", entityId: id, summary: `${id ? "Updated" : "Created"} brand “${data.name}”` });
    return done(id ? "Brand saved." : "Brand created.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteBrandAction(id: string): Promise<ActionState> {
  try {
    const user = await assertPermission("catalog.manage");
    const brand = await db.brand.findUnique({ where: { id }, select: { name: true } });
    if (!brand) return failure("Brand not found.");
    await db.brand.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await db.product.updateMany({ where: { brandId: id }, data: { brandId: null } });
    await writeAudit({ actorId: user.id, action: "brand.delete", entityType: "Brand", entityId: id, summary: `Deleted brand “${brand.name}”` });
    return done("Brand deleted.");
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Collections ─────────────────────────────────────────────────────────────

const collectionSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Enter a name.").max(80), slug: z.string().trim().max(120).optional(), description: optional(500), rule: z.enum(CollectionRule), imageId: z.string().optional().transform((value) => value || null), isActive: bool, seoTitle: optional(120), seoDescription: optional(320) });

export async function saveCollectionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("catalog.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = collectionSchema.safeParse({ ...raw, id: raw.id || undefined, isActive: raw.isActive ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, ...data } = parsed.data;
    const slug = await uniqueSlug(data.slug || data.name, async (candidate) => {
      const clash = await db.collection.findUnique({ where: { slug: candidate }, select: { id: true } });
      return !!clash && clash.id !== id;
    });
    if (id) await db.collection.update({ where: { id }, data: { ...data, slug } });
    else await db.collection.create({ data: { ...data, slug, position: await db.collection.count() } });
    await writeAudit({ actorId: user.id, action: id ? "collection.update" : "collection.create", entityType: "Collection", entityId: id, summary: `${id ? "Updated" : "Created"} collection “${data.name}”` });
    return done(id ? "Collection saved." : "Collection created.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteCollectionAction(id: string): Promise<ActionState> {
  try {
    const user = await assertPermission("catalog.manage");
    const collection = await db.collection.findUnique({ where: { id }, select: { name: true } });
    if (!collection) return failure("Collection not found.");
    await db.collection.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await writeAudit({ actorId: user.id, action: "collection.delete", entityType: "Collection", entityId: id, summary: `Deleted collection “${collection.name}”` });
    return done("Collection deleted.");
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export async function saveTagAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("catalog.manage");
    const id = String(formData.get("id") ?? "") || undefined;
    const name = String(formData.get("name") ?? "").trim();
    if (!name || name.length > 40) return failure("Enter a tag name (up to 40 characters).");
    const slug = slugify(name);
    if (id) await db.tag.update({ where: { id }, data: { name, slug } });
    else await db.tag.upsert({ where: { slug }, create: { name, slug }, update: { name } });
    return done("Tag saved.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteTagAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("catalog.manage");
    await db.tag.delete({ where: { id } });
    return done("Tag deleted.");
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Attributes ──────────────────────────────────────────────────────────────

const attributeSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(AttributeType),
  isVariantOption: bool,
  isFilterable: bool,
  /** One value per line; "Navy #1f2a44" sets a swatch colour. */
  values: z.string().max(5000),
});

export async function saveAttributeAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("catalog.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = attributeSchema.safeParse({ ...raw, id: raw.id || undefined, isVariantOption: raw.isVariantOption ?? undefined, isFilterable: raw.isFilterable ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, values, ...data } = parsed.data;
    const slug = slugify(data.name);
    const lines = values.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 200);
    const attribute = id ? await db.attribute.update({ where: { id }, data: { ...data, slug } }) : await db.attribute.create({ data: { ...data, slug, position: await db.attribute.count() } });
    const existing = await db.attributeValue.findMany({ where: { attributeId: attribute.id } });
    const keep = new Set<string>();
    for (const [position, line] of lines.entries()) {
      const match = line.match(/^(.*?)(?:\s+(#[0-9a-fA-F]{3,8}))?$/);
      const value = (match?.[1] ?? line).trim();
      const colorHex = match?.[2] ?? null;
      const valueSlug = slugify(value);
      const saved = await db.attributeValue.upsert({
        where: { attributeId_slug: { attributeId: attribute.id, slug: valueSlug } },
        create: { attributeId: attribute.id, value, slug: valueSlug, colorHex, position },
        update: { value, colorHex: colorHex ?? undefined, position },
      });
      keep.add(saved.id);
    }
    const removed = existing.filter((value) => !keep.has(value.id));
    for (const value of removed) {
      const inUse = await db.variantOptionValue.count({ where: { attributeValueId: value.id } });
      if (inUse === 0) await db.attributeValue.delete({ where: { id: value.id } });
    }
    await writeAudit({ actorId: user.id, action: id ? "attribute.update" : "attribute.create", entityType: "Attribute", entityId: attribute.id, summary: `${id ? "Updated" : "Created"} attribute “${data.name}” (${lines.length} values)` });
    return done(id ? "Attribute saved." : "Attribute created.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteAttributeAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("catalog.manage");
    const inUse = await db.variantOptionValue.count({ where: { attributeValue: { attributeId: id } } });
    if (inUse > 0) return failure("This attribute defines existing variants and can't be deleted.");
    await db.attribute.delete({ where: { id } });
    return done("Attribute deleted.");
  } catch (error) {
    return handleActionError(error);
  }
}
