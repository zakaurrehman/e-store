import type { Metadata } from "next";
import { Suspense } from "react";
import { BannersManager, HomeSectionsManager, MenusManager, type SectionRow } from "@/components/admin/content/content-managers";
import { Card, FilterLink, PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import type { HomeSectionType } from "@/features/cms/home-sections";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Homepage & banners" };

const TABS = [
  ["home", "Homepage sections"],
  ["banners", "Banners"],
  ["menus", "Menus"],
] as const;

async function Content({ searchParams }: PageProps<"/admin/content">) {
  const [, query] = await Promise.all([requirePagePermission("content.manage", "/admin/content"), searchParams]);
  const tab = TABS.find(([key]) => key === query.tab)?.[0] ?? "home";
  let content: React.ReactNode = null;
  if (tab === "home") {
    const [sections, banners, categories, brands] = await Promise.all([
      db.homeSection.findMany({ orderBy: { position: "asc" } }),
      db.banner.findMany({ orderBy: [{ placement: "asc" }, { position: "asc" }], select: { id: true, title: true, placement: true } }),
      db.category.findMany({ where: { deletedAt: null, parentId: null }, orderBy: { position: "asc" }, select: { slug: true, name: true } }),
      db.brand.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    ]);
    content = <HomeSectionsManager sections={sections.map((section) => ({ id: section.id, type: section.type as HomeSectionType, title: section.title, subtitle: section.subtitle, isActive: section.isActive, config: (section.config as Record<string, unknown>) ?? {} }) satisfies SectionRow)} options={{ banners, categories, brands }} />;
  } else if (tab === "banners") {
    const banners = await db.banner.findMany({ orderBy: [{ placement: "asc" }, { position: "asc" }], include: { image: { select: { id: true, url: true } }, mobileImage: { select: { id: true, url: true } } } });
    content = <BannersManager banners={banners.map((banner) => ({ ...banner, startsAt: banner.startsAt?.toISOString() ?? null, endsAt: banner.endsAt?.toISOString() ?? null }))} />;
  } else {
    const menus = await db.menu.findMany({ orderBy: { name: "asc" }, include: { items: { where: { parentId: null }, orderBy: { position: "asc" } } } });
    content = <MenusManager menus={menus} />;
  }
  return (
    <>
      <PageHeader title="Homepage & banners" description="Arrange the homepage, manage promotional banners and edit footer menus. Changes appear on the store immediately." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <FilterLink key={key} href={`/admin/content?tab=${key}`} active={tab === key}>
            {label}
          </FilterLink>
        ))}
      </div>
      <Card>{content}</Card>
    </>
  );
}

export default function ContentPage(props: PageProps<"/admin/content">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Content {...props} />
    </Suspense>
  );
}
