import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import { HomeSection } from "@/components/store/home/sections";
import { StoreReviewsHighlight } from "@/components/store/reviews/store-reviews-highlight";
import { JsonLd, organizationJsonLd, storeOrganizationJsonLd, websiteJsonLd } from "@/components/seo/json-ld";
import { Skeleton } from "@/components/ui/misc";
import { getHomeSections } from "@/features/cms/home-queries";
import type { HomeSectionType } from "@/features/cms/home-sections";
import { getStoreSettings } from "@/features/settings/queries";
import { storeFromParams } from "@/features/stores/route";

export async function generateMetadata({ params }: PageProps<"/s/[store]">): Promise<Metadata> {
  const store = await storeFromParams(params);
  if (store.isPlatformStore) {
    const settings = await getStoreSettings();
    return {
      title: { absolute: settings.seo.defaultTitle },
      description: settings.seo.defaultDescription,
      alternates: { canonical: "/" },
      openGraph: { title: settings.seo.defaultTitle, description: settings.seo.defaultDescription, type: "website", url: "/" },
    };
  }
  const title = store.tagline ? `${store.name} — ${store.tagline}` : store.name;
  const description = store.heroSubtitle ?? store.tagline ?? `Shop ${store.name}.`;
  return { title: { absolute: title }, description, alternates: { canonical: "/" }, openGraph: { title, description, type: "website", url: "/" } };
}

/** Every store uses the same home layout (managed in the admin CMS); owner stores get their own hero text, image and shelf. */
async function Home({ params }: PageProps<"/s/[store]">) {
  const store = await storeFromParams(params);
  const [sections, settings] = await Promise.all([getHomeSections(), getStoreSettings()]);
  const structured = store.isPlatformStore ? [organizationJsonLd(settings), websiteJsonLd(settings.store)] : [storeOrganizationJsonLd(store), websiteJsonLd({ name: store.name, url: store.url })];
  return (
    <>
      <JsonLd data={structured} />
      {sections.map((section, index) => (
        <Fragment key={section.id}>
          <HomeSection store={store} section={{ ...section, type: section.type as HomeSectionType }} />
          {/* The store's rating sits right under the first section (the hero), where shoppers see it first. */}
          {index === 0 && (
            <Suspense fallback={null}>
              <StoreReviewsHighlight store={store} />
            </Suspense>
          )}
        </Fragment>
      ))}
      {sections.length === 0 && (
        <Suspense fallback={null}>
          <StoreReviewsHighlight store={store} />
        </Suspense>
      )}
    </>
  );
}

export default function HomePage(props: PageProps<"/s/[store]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[min(86svh,48rem)] min-h-[32rem] rounded-none" />}>
      <Home {...props} />
    </Suspense>
  );
}
