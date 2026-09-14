"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { BannerPlacement, HomeSectionType, PublishStatus } from "@/generated/prisma/enums";
import { homeSectionConfigSchemas, type HomeSectionType as SectionType } from "@/features/cms/home-sections";
import { CMS_TAG } from "@/features/cms/queries";
import { failure, handleActionError, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { slugify, uniqueSlug } from "@/utils/slug";

function done(message: string, paths: string[] = []): ActionState {
  updateTag(CMS_TAG);
  revalidatePath("/admin/content", "layout");
  for (const path of paths) revalidatePath(path);
  return { status: "success", message };
}

const bool = z.union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()]).transform((value) => value === "on" || value === "true");
const optional = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const optionalDate = z.string().trim().optional().transform((value) => (value ? new Date(value) : null)).refine((value) => value === null || !Number.isNaN(value.getTime()), "Enter a valid date.");

// ─── Banners ─────────────────────────────────────────────────────────────────

const bannerSchema = z.object({
  id: z.string().optional(),
  placement: z.enum(BannerPlacement),
  eyebrow: optional(60),
  title: z.string().trim().min(1, "Enter a title.").max(120),
  subtitle: optional(240),
  ctaLabel: optional(40),
  ctaHref: optional(300).refine((value) => !value || value.startsWith("/") || value.startsWith("https://"), "Link must start with / or https://"),
  imageId: z.string().optional().transform((value) => value || null),
  mobileImageId: z.string().optional().transform((value) => value || null),
  theme: z.enum(["dark", "light"]),
  isActive: bool,
  startsAt: optionalDate,
  endsAt: optionalDate,
});

export async function saveBannerAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("content.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = bannerSchema.safeParse({ ...raw, id: raw.id || undefined, isActive: raw.isActive ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, ...data } = parsed.data;
    if (id) await db.banner.update({ where: { id }, data });
    else await db.banner.create({ data: { ...data, position: await db.banner.count({ where: { placement: data.placement } }) } });
    await writeAudit({ actorId: user.id, action: id ? "banner.update" : "banner.create", entityType: "Banner", entityId: id, summary: `${id ? "Updated" : "Created"} banner “${data.title}”` });
    return done(id ? "Banner saved." : "Banner created.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteBannerAction(id: string): Promise<ActionState> {
  try {
    const user = await assertPermission("content.manage");
    await db.banner.delete({ where: { id } });
    await writeAudit({ actorId: user.id, action: "banner.delete", entityType: "Banner", entityId: id, summary: "Deleted banner" });
    return done("Banner deleted.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Home sections ───────────────────────────────────────────────────────────

const sectionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(HomeSectionType),
  title: optional(120),
  subtitle: optional(240),
  isActive: bool,
  config: z.string().default("{}"),
});

export async function saveHomeSectionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("content.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = sectionSchema.safeParse({ ...raw, id: raw.id || undefined, isActive: raw.isActive ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, config, ...data } = parsed.data;
    let configObject: unknown;
    try {
      configObject = JSON.parse(config || "{}");
    } catch {
      return failure("Configuration must be valid JSON.");
    }
    const validated = homeSectionConfigSchemas[data.type as SectionType].safeParse(configObject);
    if (!validated.success) return failure(`Configuration: ${validated.error.issues[0]?.path.join(".")} ${validated.error.issues[0]?.message}`);
    const payload = { ...data, config: validated.data as Prisma.InputJsonValue };
    if (id) await db.homeSection.update({ where: { id }, data: payload });
    else await db.homeSection.create({ data: { ...payload, position: await db.homeSection.count() } });
    await writeAudit({ actorId: user.id, action: id ? "home.section.update" : "home.section.create", entityType: "HomeSection", entityId: id, summary: `${id ? "Updated" : "Added"} homepage section ${data.type}` });
    return done(id ? "Section saved." : "Section added.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteHomeSectionAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    await db.homeSection.delete({ where: { id } });
    return done("Section removed.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function reorderHomeSectionsAction(ids: string[]): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    await db.$transaction(ids.map((id, position) => db.homeSection.update({ where: { id }, data: { position } })));
    return done("Order saved.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Pages ───────────────────────────────────────────────────────────────────

const pageSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Enter a title.").max(120),
  slug: z.string().trim().max(120).optional(),
  excerpt: optional(300),
  content: z.string().max(100_000),
  status: z.enum(PublishStatus),
  seoTitle: optional(120),
  seoDescription: optional(320),
});

export async function savePageAction(_state: ActionState, formData: FormData): Promise<ActionState<{ id: string }>> {
  try {
    const user = await assertPermission("content.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = pageSchema.safeParse({ ...raw, id: raw.id || undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, ...data } = parsed.data;
    const slug = await uniqueSlug(data.slug || data.title, async (candidate) => {
      const clash = await db.page.findUnique({ where: { slug: candidate }, select: { id: true } });
      return !!clash && clash.id !== id;
    });
    const publishedAt = data.status === PublishStatus.PUBLISHED ? new Date() : null;
    const page = id
      ? await db.page.update({ where: { id }, data: { ...data, slug, publishedAt: data.status === PublishStatus.PUBLISHED ? ((await db.page.findUnique({ where: { id }, select: { publishedAt: true } }))?.publishedAt ?? publishedAt) : null } })
      : await db.page.create({ data: { ...data, slug, publishedAt } });
    await writeAudit({ actorId: user.id, action: id ? "page.update" : "page.create", entityType: "Page", entityId: page.id, summary: `${id ? "Updated" : "Created"} page “${page.title}”` });
    updateTag(`page:${slug}`);
    done("", [`/pages/${slug}`]);
    return { status: "success", message: id ? "Page saved." : "Page created.", data: { id: page.id } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deletePageAction(id: string): Promise<ActionState> {
  try {
    const user = await assertPermission("content.manage");
    const page = await db.page.findUnique({ where: { id }, select: { title: true, slug: true } });
    if (!page) return failure("Page not found.");
    await db.page.update({ where: { id }, data: { deletedAt: new Date(), status: PublishStatus.DRAFT } });
    await writeAudit({ actorId: user.id, action: "page.delete", entityType: "Page", entityId: id, summary: `Deleted page “${page.title}”` });
    updateTag(`page:${page.slug}`);
    return done("Page deleted.", [`/pages/${page.slug}`]);
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const faqSchema = z.object({ id: z.string().optional(), group: z.string().trim().min(1, "Enter a group.").max(60), question: z.string().trim().min(3, "Enter the question.").max(200), answer: z.string().trim().min(3, "Enter the answer.").max(2000), isPublished: bool });

export async function saveFaqAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = faqSchema.safeParse({ ...raw, id: raw.id || undefined, isPublished: raw.isPublished ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, ...data } = parsed.data;
    if (id) await db.faqItem.update({ where: { id }, data });
    else await db.faqItem.create({ data: { ...data, position: await db.faqItem.count({ where: { group: data.group } }) } });
    return done(id ? "FAQ saved." : "FAQ added.", ["/faq"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteFaqAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    await db.faqItem.delete({ where: { id } });
    return done("FAQ deleted.", ["/faq"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function reorderFaqAction(ids: string[]): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    await db.$transaction(ids.map((id, position) => db.faqItem.update({ where: { id }, data: { position } })));
    return done("Order saved.", ["/faq"]);
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Menus ───────────────────────────────────────────────────────────────────

const menuItemSchema = z.object({
  id: z.string().optional(),
  menuId: z.string(),
  label: z.string().trim().min(1, "Enter a label.").max(60),
  href: z.string().trim().min(1, "Enter a link.").max(300).refine((value) => value.startsWith("/") || value.startsWith("https://") || value.startsWith("mailto:"), "Link must start with /, https:// or mailto:"),
  isActive: bool,
});

export async function saveMenuItemAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = menuItemSchema.safeParse({ ...raw, id: raw.id || undefined, isActive: raw.isActive ?? undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const { id, ...data } = parsed.data;
    if (id) await db.menuItem.update({ where: { id }, data });
    else await db.menuItem.create({ data: { ...data, position: await db.menuItem.count({ where: { menuId: data.menuId, parentId: null } }) } });
    const menu = await db.menu.findUnique({ where: { id: data.menuId }, select: { key: true } });
    if (menu) updateTag(`menu:${menu.key}`);
    return done(id ? "Link saved." : "Link added.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteMenuItemAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    const item = await db.menuItem.delete({ where: { id }, include: { menu: { select: { key: true } } } });
    updateTag(`menu:${item.menu.key}`);
    return done("Link removed.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function reorderMenuItemsAction(menuId: string, ids: string[]): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    await db.$transaction(ids.map((id, position) => db.menuItem.update({ where: { id, menuId }, data: { position } })));
    const menu = await db.menu.findUnique({ where: { id: menuId }, select: { key: true } });
    if (menu) updateTag(`menu:${menu.key}`);
    return done("Order saved.", ["/"]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createMenuAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("content.manage");
    const name = String(formData.get("name") ?? "").trim();
    if (!name || name.length > 60) return failure("Enter a menu name.");
    const key = slugify(name);
    if (await db.menu.findUnique({ where: { key } })) return failure("A menu with that name already exists.");
    await db.menu.create({ data: { key, name } });
    return done("Menu created.");
  } catch (error) {
    return handleActionError(error);
  }
}
