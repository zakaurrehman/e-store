import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { resolveSiteUrl } from "@/lib/site-url";
import { classifyHost, storeBaseDomain, storeUrl } from "@/lib/tenancy";

/** Answers for whichever host asked: the platform site or a store's own domain. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const host = classifyHost((await headers()).get("host"), storeBaseDomain());
  const base = host.kind === "store" ? storeUrl(host.slug) : resolveSiteUrl();
  const disallow =
    host.kind === "store"
      ? ["/api/", "/account", "/checkout", "/cart", "/orders/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/media/", "/search"]
      : ["/admin", "/dashboard", "/api/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/media/"];
  return { rules: [{ userAgent: "*", allow: "/", disallow }], sitemap: `${base}/sitemap.xml`, host: base };
}
