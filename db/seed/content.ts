import type { Prisma } from "@/generated/prisma/client";
import { BannerPlacement, HomeSectionType, PublishStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ingestPhoto } from "./catalog";
import { BANNERS, FAQ, MENUS, PAGES } from "./data/content";

export async function seedContent() {
  let pages = 0;
  for (const page of PAGES) {
    const exists = await db.page.findUnique({ where: { slug: page.slug } });
    if (exists) continue;
    await db.page.create({ data: { ...page, status: PublishStatus.PUBLISHED, publishedAt: new Date(), seoDescription: page.excerpt } });
    pages++;
  }

  if ((await db.faqItem.count()) === 0) {
    await db.faqItem.createMany({ data: FAQ.map((item, position) => ({ ...item, position })) });
  }

  for (const [key, items] of Object.entries(MENUS)) {
    const exists = await db.menu.findUnique({ where: { key } });
    if (exists) continue;
    await db.menu.create({
      data: {
        key,
        name: key.replace("footer-", "Footer · ").replace(/^\w/, (c) => c.toUpperCase()),
        items: { create: items.map((item, position) => ({ ...item, position })) },
      },
    });
  }

  const bannerIds = new Map<string, string>();
  if ((await db.banner.count()) === 0) {
    for (const [position, banner] of BANNERS.entries()) {
      const image = await ingestPhoto(banner.photo, "wide", banner.alt, "banners");
      const created = await db.banner.create({
        data: {
          placement: banner.placement as BannerPlacement,
          eyebrow: banner.eyebrow,
          title: banner.title,
          subtitle: banner.subtitle,
          ctaLabel: banner.ctaLabel,
          ctaHref: banner.ctaHref,
          theme: banner.theme,
          imageId: image.id,
          position,
        },
      });
      bannerIds.set(banner.key, created.id);
    }
  }

  if ((await db.homeSection.count()) === 0) {
    const sections: Array<{ type: HomeSectionType; title?: string; subtitle?: string; config: Prisma.InputJsonValue }> = [
      { type: HomeSectionType.HERO, config: { bannerId: bannerIds.get("hero") } },
      {
        type: HomeSectionType.TRUST_BAR,
        config: {
          items: [
            { icon: "truck", title: "Free US shipping over $150", text: "Tracked delivery, dispatched within 1 business day" },
            { icon: "returns", title: "15-day returns", text: "Free returns on eligible US orders" },
            { icon: "secure", title: "Secure checkout", text: "Payments verified by our payment partners" },
            { icon: "support", title: "Real people, real help", text: "Replies within one business day" },
          ],
        },
      },
      { type: HomeSectionType.CATEGORY_GRID, title: "Shop by department", config: { categorySlugs: ["women", "men", "beauty", "jewellery", "watches", "home"] } },
      { type: HomeSectionType.PRODUCT_RAIL, title: "Just landed", subtitle: "The newest pieces from our labels.", config: { source: "new", limit: 8, ctaLabel: "Shop new arrivals", ctaHref: "/collections/new-arrivals" } },
      { type: HomeSectionType.PROMO_BANNERS, config: { bannerIds: [bannerIds.get("promo-layers"), bannerIds.get("promo-home")].filter(Boolean) as string[] } },
      { type: HomeSectionType.PRODUCT_RAIL, title: "Trending now", subtitle: "What customers are ordering this month.", config: { source: "trending", limit: 8 } },
      { type: HomeSectionType.PRODUCT_RAIL, title: "Best sellers", config: { source: "best-sellers", limit: 8, ctaLabel: "Shop best sellers", ctaHref: "/collections/best-sellers" } },
      { type: HomeSectionType.EDITORIAL, config: { bannerId: bannerIds.get("editorial-tailoring"), align: "left" } },
      { type: HomeSectionType.PRODUCT_RAIL, title: "Editors’ picks", subtitle: "Chosen by our buying team this season.", config: { source: "featured", limit: 8, ctaLabel: "See all picks", ctaHref: "/collections/editors-picks" } },
      { type: HomeSectionType.BRAND_STRIP, title: "Our labels", config: { brandSlugs: [] } },
      { type: HomeSectionType.REVIEWS, title: "Loved by customers", config: { limit: 6 } },
      { type: HomeSectionType.PRODUCT_RAIL, title: "On sale", subtitle: "Limited-time prices across the store.", config: { source: "sale", limit: 8, ctaLabel: "Shop the sale", ctaHref: "/collections/sale" } },
      { type: HomeSectionType.NEWSLETTER, title: "Be the _first_ to know", config: { text: "New arrivals, restocks and early access to seasonal sales. One or two emails a month." } },
    ];
    await db.homeSection.createMany({ data: sections.map((section, position) => ({ ...section, position })) });
  }

  console.log(`✓ content: ${pages} pages, ${FAQ.length} FAQ items, ${Object.keys(MENUS).length} menus, ${BANNERS.length} banners`);
}
