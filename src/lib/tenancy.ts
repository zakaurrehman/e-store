/**
 * Which store a request belongs to, decided from its hostname.
 *
 *   www.zendropship.io / zendropship.io      → the platform site (marketing, catalogue, owner dashboard, admin)
 *   <slug>.zendropship.io                    → that owner's storefront
 *   *.vercel.app                             → the platform site (preview and default deployment hosts)
 *   localhost / <slug>.localhost (dev)       → same rules on the development server
 *
 * Pure functions only: this module is used by the request proxy, which must not depend on application code.
 */

/** The platform-run demo store every visitor can browse (created by the stores migration and the seed). */
export const DEMO_STORE_SLUG = "demo";

/** Subdomains that can never be store slugs. */
export const RESERVED_STORE_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "mail", "email", "smtp", "imap", "pop", "ftp", "ns1", "ns2", "static", "cdn", "assets", "media", "img",
  "help", "support", "docs", "blog", "status", "dev", "staging", "test", "testing", "preview", "shop", "store", "stores", "login", "register", "signup",
  "account", "accounts", "checkout", "cart", "billing", "payments", "stripe", "paypal", "webhooks", "cron", "root", "system", "zendropship", "vercel",
]);

export const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

export function isValidStoreSlug(slug: string): boolean {
  return STORE_SLUG_PATTERN.test(slug) && !RESERVED_STORE_SLUGS.has(slug) && !slug.includes("--");
}

const COMBINING_MARKS = /[̀-ͯ]/g;
const APOSTROPHES = /['’]/g;

/** Turns a store name into a slug candidate: "Maya's Closet!" → "mayas-closet". */
export function slugFromStoreName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(APOSTROPHES, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

/**
 * The domain stores hang off, e.g. "zendropship.io" (stores are "<slug>.zendropship.io").
 * STORE_DOMAIN wins; otherwise it is derived from APP_URL, the Vercel production domain, or "localhost".
 */
export function storeBaseDomain(env: Record<string, string | undefined> = process.env): string {
  const configured = env.STORE_DOMAIN?.trim().toLowerCase();
  if (configured) return configured.replace(/^www\./, "").replace(/:\d+$/, "");
  const candidates = [env.APP_URL, env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      const host = new URL(candidate.trim()).hostname.toLowerCase();
      if (host.endsWith(".vercel.app")) continue;
      return host.replace(/^www\./, "");
    } catch {
      // fall through to the next candidate
    }
  }
  return "localhost";
}

export type HostKind = { kind: "platform" } | { kind: "store"; slug: string } | { kind: "unknown"; host: string };

/** Classifies a request Host header. Ports are ignored so the rules work on the development server. */
export function classifyHost(hostHeader: string | null | undefined, baseDomain: string): HostKind {
  const host = (hostHeader ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  if (!host) return { kind: "unknown", host };
  if (host === baseDomain || host === `www.${baseDomain}`) return { kind: "platform" };
  if (host.endsWith(".vercel.app") || host === "localhost" || host === "127.0.0.1") return { kind: "platform" };
  if (host.endsWith(`.${baseDomain}`)) {
    const slug = host.slice(0, -(baseDomain.length + 1));
    if (!slug.includes(".") && isValidStoreSlug(slug)) return { kind: "store", slug };
    return { kind: "unknown", host };
  }
  return { kind: "unknown", host };
}

/** Public URL of a store, e.g. https://maya.zendropship.io (http and port on the development server). */
export function storeUrl(slug: string, env: Record<string, string | undefined> = process.env): string {
  const base = storeBaseDomain(env);
  if (base === "localhost") {
    let port = "3000";
    try {
      port = new URL(env.APP_URL ?? "http://localhost:3000").port || "3000";
    } catch {
      // keep the default port
    }
    return `http://${slug}.localhost:${port}`;
  }
  return `https://${slug}.${base}`;
}
