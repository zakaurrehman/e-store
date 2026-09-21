import type { StoreSettings } from "@/features/settings/schema";
import { resolveSiteUrl } from "@/lib/site-url";

const baseUrl = () => resolveSiteUrl();
/** Absolute URL for a path, on the platform site by default or on a store's own domain when `base` is given. */
export const absolute = (path: string, base: string = baseUrl()) => (path.startsWith("http") ? path : `${base.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`);

/** Serialises structured data safely (escapes `<` so content can never close the script tag). */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function organizationJsonLd(settings: StoreSettings) {
  const sameAs = Object.values(settings.social).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.store.name,
    legalName: settings.store.legalName,
    url: baseUrl(),
    logo: absolute("/brand/zendropship-mark.svg"),
    ...(sameAs.length ? { sameAs } : {}),
    ...(settings.store.supportEmail ? { contactPoint: { "@type": "ContactPoint", contactType: "customer service", email: settings.store.supportEmail } } : {}),
  };
}

/** Organisation data for an owner's store (the platform demo store uses organizationJsonLd). */
export function storeOrganizationJsonLd(store: { name: string; url: string; logo: { url: string } | null; supportEmail: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    url: store.url,
    ...(store.logo ? { logo: absolute(store.logo.url, store.url) } : {}),
    ...(store.supportEmail ? { contactPoint: { "@type": "ContactPoint", contactType: "customer service", email: store.supportEmail } } : {}),
  };
}

export function websiteJsonLd(site: { name: string; url?: string }) {
  const url = site.url ?? baseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${url}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; href: string }>, base?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absolute(item.href, base) })),
  };
}
