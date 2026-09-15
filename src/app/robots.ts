import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = resolveSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/account", "/checkout", "/cart", "/orders/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/media/", "/search"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
