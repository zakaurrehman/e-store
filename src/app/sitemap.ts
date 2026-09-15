import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { ProductStatus, PublishStatus } from "@/generated/prisma/enums";
import { resolveSiteUrl } from "@/lib/site-url";
import { db } from "@/server/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Generated per request so newly published products, categories and pages appear without a rebuild.
  await connection();
  const base = resolveSiteUrl();
  const [products, categories, brands, collections, pages] = await Promise.all([
    db.product.findMany({ where: { status: ProductStatus.ACTIVE, deletedAt: null }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 5000 }),
    db.category.findMany({ where: { isActive: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
    db.brand.findMany({ where: { isActive: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
    db.collection.findMany({ where: { isActive: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
    db.page.findMany({ where: { status: PublishStatus.PUBLISHED, deletedAt: null }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/brands`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.4 },
    ...categories.map((category) => ({ url: `${base}/c/${category.slug}`, lastModified: category.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...collections.map((collection) => ({ url: `${base}/collections/${collection.slug}`, lastModified: collection.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...brands.map((brand) => ({ url: `${base}/brands/${brand.slug}`, lastModified: brand.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((product) => ({ url: `${base}/p/${product.slug}`, lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...pages.map((page) => ({ url: `${base}/pages/${page.slug}`, lastModified: page.updatedAt, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
