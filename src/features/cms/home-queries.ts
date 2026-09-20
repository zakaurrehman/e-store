import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { ReviewStatus } from "@/generated/prisma/enums";
import { CATALOG_TAG } from "@/features/catalog/queries";
import { db } from "@/server/db";
import { CMS_TAG } from "./queries";

export async function getHomeSections() {
  "use cache";
  cacheLife("hours");
  cacheTag(CMS_TAG, "home");
  return db.homeSection.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
    select: { id: true, type: true, title: true, subtitle: true, config: true },
  });
}

export type BannerData = {
  id: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  theme: string;
  image: { url: string; alt: string; width: number; height: number } | null;
  mobileImage: { url: string; alt: string; width: number; height: number } | null;
};

/** Active banners for a placement (or specific ids), respecting scheduling windows. */
export async function getBanners(options: { placement?: "HERO" | "PROMO" | "CATEGORY"; ids?: string[] }): Promise<BannerData[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CMS_TAG, "banners");
  const now = new Date();
  const banners = await db.banner.findMany({
    where: {
      isActive: true,
      ...(options.ids?.length ? { id: { in: options.ids } } : {}),
      ...(options.placement ? { placement: options.placement } : {}),
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { position: "asc" },
    include: { image: true, mobileImage: true },
  });
  const toImage = (media: (typeof banners)[number]["image"], alt: string) =>
    media ? { url: media.url, alt: media.alt || alt, width: media.width ?? 1600, height: media.height ?? 1000 } : null;
  const mapped = banners.map((banner) => ({
    id: banner.id,
    eyebrow: banner.eyebrow,
    title: banner.title,
    subtitle: banner.subtitle,
    ctaLabel: banner.ctaLabel,
    ctaHref: banner.ctaHref,
    theme: banner.theme,
    image: toImage(banner.image, banner.title),
    mobileImage: toImage(banner.mobileImage, banner.title),
  }));
  if (options.ids?.length) {
    const order = new Map(options.ids.map((id, index) => [id, index]));
    mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  return mapped;
}

/** Products a store sells, as a relation filter (every active product when no store is given). */
const inStore = (storeId: string | null) =>
  storeId ? { status: "ACTIVE" as const, deletedAt: null, storeProducts: { some: { storeId, isActive: true } } } : { status: "ACTIVE" as const, deletedAt: null };

export async function getCategoryTiles(slugs: string[], storeId: string | null = null) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, "categories");
  const categories = await db.category.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(slugs.length ? { slug: { in: slugs } } : { parentId: null }),
      // A store only shows departments it stocks (directly or through a sub-category).
      ...(storeId ? { OR: [{ products: { some: { product: inStore(storeId) } } }, { children: { some: { products: { some: { product: inStore(storeId) } } } } }] } : {}),
    },
    orderBy: { position: "asc" },
    select: { id: true, name: true, slug: true, image: { select: { url: true, alt: true } } },
  });
  if (slugs.length) {
    const order = new Map(slugs.map((slug, index) => [slug, index]));
    categories.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
  }
  return categories;
}

export async function getFeaturedReviews(limit: number, storeId: string | null = null) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, "reviews");
  return db.review.findMany({
    where: { status: ReviewStatus.APPROVED, isFeatured: true, deletedAt: null, product: inStore(storeId) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      authorName: true,
      isVerifiedPurchase: true,
      createdAt: true,
      product: { select: { name: true, slug: true } },
    },
  });
}

export async function getFeaturedBrands(slugs: string[], storeId: string | null = null) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, "brands");
  return db.brand.findMany({
    where: { isActive: true, deletedAt: null, ...(slugs.length ? { slug: { in: slugs } } : { isFeatured: true }), ...(storeId ? { products: { some: inStore(storeId) } } : {}) },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true },
  });
}
