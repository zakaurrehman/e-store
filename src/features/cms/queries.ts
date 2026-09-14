import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { PublishStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export const CMS_TAG = "cms";

export type MenuLink = { id: string; label: string; href: string; children: Array<{ id: string; label: string; href: string }> };

export async function getMenu(key: string): Promise<MenuLink[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CMS_TAG, `menu:${key}`);
  const menu = await db.menu.findUnique({
    where: { key },
    include: {
      items: {
        where: { parentId: null, isActive: true },
        orderBy: { position: "asc" },
        include: { children: { where: { isActive: true }, orderBy: { position: "asc" } } },
      },
    },
  });
  if (!menu) return [];
  return menu.items.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    children: item.children.map((child) => ({ id: child.id, label: child.label, href: child.href })),
  }));
}

export async function getPublishedPage(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CMS_TAG, `page:${slug}`);
  return db.page.findFirst({ where: { slug, status: PublishStatus.PUBLISHED, deletedAt: null } });
}

export async function listPublishedPages() {
  "use cache";
  cacheLife("hours");
  cacheTag(CMS_TAG);
  return db.page.findMany({ where: { status: PublishStatus.PUBLISHED, deletedAt: null }, select: { slug: true, title: true, updatedAt: true } });
}

export async function getFaqItems() {
  "use cache";
  cacheLife("hours");
  cacheTag(CMS_TAG, "faq");
  const items = await db.faqItem.findMany({ where: { isPublished: true }, orderBy: [{ group: "asc" }, { position: "asc" }] });
  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()].map(([group, entries]) => ({ group, items: entries.map(({ id, question, answer }) => ({ id, question, answer })) }));
}
