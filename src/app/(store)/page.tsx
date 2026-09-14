import type { Metadata } from "next";
import { HomeSection } from "@/components/store/home/sections";
import { JsonLd, organizationJsonLd, websiteJsonLd } from "@/components/seo/json-ld";
import { getHomeSections } from "@/features/cms/home-queries";
import type { HomeSectionType } from "@/features/cms/home-sections";
import { getStoreSettings } from "@/features/settings/queries";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  return {
    title: { absolute: settings.seo.defaultTitle },
    description: settings.seo.defaultDescription,
    alternates: { canonical: "/" },
    openGraph: { title: settings.seo.defaultTitle, description: settings.seo.defaultDescription, type: "website", url: "/" },
  };
}

export default async function HomePage() {
  const [sections, settings] = await Promise.all([getHomeSections(), getStoreSettings()]);
  return (
    <>
      <JsonLd data={[organizationJsonLd(settings), websiteJsonLd(settings)]} />
      {sections.map((section) => (
        <HomeSection key={section.id} section={{ ...section, type: section.type as HomeSectionType }} />
      ))}
    </>
  );
}
