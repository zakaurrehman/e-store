import type { StoreSettings } from "@/features/settings/schema";

const baseUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const absolute = (path: string) => (path.startsWith("http") ? path : `${baseUrl()}${path.startsWith("/") ? "" : "/"}${path}`);

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
    logo: absolute("/brand/veyora-mark.svg"),
    ...(sameAs.length ? { sameAs } : {}),
    ...(settings.store.supportEmail ? { contactPoint: { "@type": "ContactPoint", contactType: "customer service", email: settings.store.supportEmail } } : {}),
  };
}

export function websiteJsonLd(settings: StoreSettings) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.store.name,
    url: baseUrl(),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${baseUrl()}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; href: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absolute(item.href) })),
  };
}
