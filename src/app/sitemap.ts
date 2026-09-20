import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ProductStatus, PublishStatus } from "@/generated/prisma/enums";
import { getStoreBySlug } from "@/features/stores/queries";
import { resolveSiteUrl } from "@/lib/site-url";
import { classifyHost, storeBaseDomain } from "@/lib/tenancy";
import { db } from "@/server/db";

/**
 * One sitemap per host: a store lists what it sells on its own domain; the platform site lists its
 * catalogue for prospective store owners. Generated per request so new products appear without a rebuild.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const host = classifyHost((await headers()).get("host"), storeBaseDomain());
  if (host.kind === "store") {
    const store = await getStoreBySlug(host.slug);
    return store ? storeSitemap(store.id, store.url) : [];
  }
  return platformSitemap(resolveSiteUrl());
}

async function storeSitemap(storeId: string, base: string): Promise<MetadataRoute.Sitemap> {
  const sold = { status: ProductStatus.ACTIVE, deletedAt: null, storeProducts: { some: { storeId, isActive: true } } };
  const [products, categories, brands, pages] = await Promise.all([
    db.product.findMany({ where: sold, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 5000 }),
    db.category.findMany({ where: { isActive: true, deletedAt: null, products: { some: { product: sold } } }, select: { slug: true, updatedAt: true } }),
    db.brand.findMany({ where: { isActive: true, deletedAt: null, products: { some: sold } }, select: { slug: true, updatedAt: true } }),
    db.page.findMany({ where: { status: PublishStatus.PUBLISHED, deletedAt: null }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/brands`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.4 },
    ...categories.map((category) => ({ url: `${base}/c/${category.slug}`, lastModified: category.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...brands.map((brand) => ({ url: `${base}/brands/${brand.slug}`, lastModified: brand.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((product) => ({ url: `${base}/p/${product.slug}`, lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...pages.map((page) => ({ url: `${base}/pages/${page.slug}`, lastModified: page.updatedAt, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}

async function platformSitemap(base: string): Promise<MetadataRoute.Sitemap> {
  const [products, categories, pages] = await Promise.all([
    db.product.findMany({ where: { status: ProductStatus.ACTIVE, deletedAt: null }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 5000 }),
    db.category.findMany({ where: { isActive: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
    db.page.findMany({ where: { status: PublishStatus.PUBLISHED, deletedAt: null }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/start`, changeFrequency: "monthly", priority: 0.8 },
    ...categories.map((category) => ({ url: `${base}/catalog/c/${category.slug}`, lastModified: category.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...products.map((product) => ({ url: `${base}/catalog/p/${product.slug}`, lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...pages.map((page) => ({ url: `${base}/pages/${page.slug}`, lastModified: page.updatedAt, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
