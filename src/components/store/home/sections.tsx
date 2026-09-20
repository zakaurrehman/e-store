import { BadgeCheck, Gift, Headphones, Leaf, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";
import { RatingStars } from "@/components/ui/rating";
import { ProductRail } from "@/components/store/product/product-rail";
import { NewsletterForm } from "@/components/store/footer/newsletter-form";
import { getCategoryTree, getProductRail } from "@/features/catalog/queries";
import { getBanners, getCategoryTiles, getFeaturedBrands, getFeaturedReviews, type BannerData } from "@/features/cms/home-queries";
import { parseHomeSectionConfig, type HomeSectionType } from "@/features/cms/home-sections";
import { scopeOf, type StoreContext } from "@/features/stores/context";
import { cn } from "@/utils/cn";

/** Renders CMS titles where `_text_` becomes an editorial italic accent. */
export function EditorialText({ text }: { text: string }) {
  const parts = text.split(/(_[^_]+_)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("_") && part.endsWith("_") ? (
          <em key={index} className="font-display font-normal italic tracking-normal">
            {part.slice(1, -1)}
          </em>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function Hero({ banner }: { banner: BannerData }) {
  const light = banner.theme === "light";
  return (
    <section className="relative isolate overflow-hidden bg-ink-900">
      <div className="relative h-[min(86svh,48rem)] min-h-[32rem]">
        {banner.image && (
          <>
            <Image
              src={banner.image.url}
              alt={banner.image.alt}
              fill
              preload
              loading="eager"
              fetchPriority="high"
              quality={75}
              sizes="100vw"
              className={cn("object-cover object-[65%_center]", banner.mobileImage && "hidden md:block")}
            />
            {banner.mobileImage && <Image src={banner.mobileImage.url} alt={banner.mobileImage.alt} fill preload sizes="100vw" className="object-cover md:hidden" />}
          </>
        )}
        <div className={cn("absolute inset-0", light ? "bg-gradient-to-t from-ink-950/70 via-ink-950/20 to-transparent md:bg-gradient-to-r md:from-ink-950/60 md:via-ink-950/20" : "bg-gradient-to-r from-white/70 via-white/30 to-transparent")} />
        <div className="container-page relative flex h-full items-end pb-12 md:items-center md:pb-0">
          <div className={cn("max-w-2xl animate-rise-in", light ? "text-white" : "text-ink-950")}>
            {banner.eyebrow && <p className={cn("text-2xs font-semibold uppercase tracking-[0.2em]", light ? "text-white/80" : "text-ink-600")}>{banner.eyebrow}</p>}
            <h1 className="mt-4 text-balance text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[5.25rem]">
              <EditorialText text={banner.title} />
            </h1>
            {banner.subtitle && <p className={cn("mt-5 max-w-lg text-base leading-relaxed sm:text-lg", light ? "text-white/85" : "text-ink-700")}>{banner.subtitle}</p>}
            {banner.ctaLabel && banner.ctaHref && (
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href={banner.ctaHref} variant={light ? "inverse" : "primary"} size="lg">
                  {banner.ctaLabel}
                </ButtonLink>
                <ButtonLink href="/brands" variant="link" size="lg" className={cn("px-2", light && "text-white decoration-white/40 hover:decoration-white")}>
                  Discover our labels
                </ButtonLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const TRUST_ICON_MAP = { truck: Truck, returns: RotateCcw, secure: ShieldCheck, support: Headphones, gift: Gift, leaf: Leaf };

function TrustBar({ items }: { items: Array<{ icon: keyof typeof TRUST_ICON_MAP; title: string; text: string }> }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Why shop with us" className="border-b border-line">
      <ul className="container-page scrollbar-none flex snap-x gap-8 overflow-x-auto py-6 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible">
        {items.map((item) => {
          const Icon = TRUST_ICON_MAP[item.icon];
          return (
            <li key={item.title} className="flex min-w-[15rem] snap-start items-start gap-3.5 md:min-w-0">
              <Icon className="mt-0.5 size-5 shrink-0 text-ink-950" strokeWidth={1.5} aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink-950">{item.title}</p>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-500">{item.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function CategoryGrid({ title, subtitle, slugs, storeId }: { title: string | null; subtitle: string | null; slugs: string[]; storeId: string }) {
  const tiles = await getCategoryTiles(slugs, storeId);
  if (tiles.length === 0) return null;
  return (
    <section className="py-12 md:py-16">
      <div className="container-page">
        <SectionHeading title={title ?? "Shop by department"} description={subtitle ?? undefined} />
        <ul className="scrollbar-none -mx-4 mt-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:gap-4 md:-mx-8 md:px-8 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
          {tiles.map((tile) => (
            <li key={tile.id} className="w-[38vw] shrink-0 snap-start sm:w-[26vw] lg:w-auto">
              <Link href={`/c/${tile.slug}`} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-canvas">
                  {tile.image && <Image src={tile.image.url} alt="" fill sizes="(min-width: 1024px) 15vw, 38vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />}
                </div>
                <p className="mt-3 flex items-center justify-between text-[0.9375rem] font-medium text-ink-950">
                  {tile.name}
                  <span aria-hidden className="text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-950">
                    →
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BannerTile({ banner, className, sizes }: { banner: BannerData; className?: string; sizes: string }) {
  const light = banner.theme === "light";
  const content = (
    <div className={cn("group relative block h-full overflow-hidden rounded-lg bg-ink-900", className)}>
      {banner.image && <Image src={banner.image.url} alt={banner.image.alt} fill sizes={sizes} className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]" />}
      <div className={cn("absolute inset-0", light ? "bg-gradient-to-t from-ink-950/65 via-ink-950/10 to-transparent" : "bg-gradient-to-t from-white/75 via-white/10 to-transparent")} />
      <div className={cn("absolute inset-x-0 bottom-0 p-6 md:p-9", light ? "text-white" : "text-ink-950")}>
        {banner.eyebrow && <p className={cn("text-2xs font-semibold uppercase tracking-[0.18em]", light ? "text-white/80" : "text-ink-600")}>{banner.eyebrow}</p>}
        <h3 className="mt-2 text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-[2.75rem]">
          <EditorialText text={banner.title} />
        </h3>
        {banner.subtitle && <p className={cn("mt-3 max-w-md text-[0.9375rem]", light ? "text-white/85" : "text-ink-700")}>{banner.subtitle}</p>}
        {banner.ctaLabel && <span className={cn("mt-5 inline-flex text-sm font-medium underline underline-offset-4", light ? "decoration-white/50 group-hover:decoration-white" : "decoration-ink-400 group-hover:decoration-ink-950")}>{banner.ctaLabel}</span>}
      </div>
    </div>
  );
  return banner.ctaHref ? (
    <Link href={banner.ctaHref} className="block h-full" aria-label={banner.title.replaceAll("_", "")}>
      {content}
    </Link>
  ) : (
    content
  );
}

/**
 * Banners are managed once for the platform. A store only shows the ones that lead somewhere it sells:
 * a banner pointing at a department the store does not stock is skipped.
 */
async function bannersForStore(store: StoreContext, banners: BannerData[]) {
  if (store.isPlatformStore) return banners;
  const tree = await getCategoryTree(scopeOf(store));
  const stocked = new Set(tree.flatMap((department) => [department.slug, ...department.children.map((child) => child.slug)]));
  return banners.filter((banner) => {
    const match = banner.ctaHref?.match(/^\/c\/([^/?#]+)/);
    return !match || stocked.has(match[1]);
  });
}

async function PromoBanners({ bannerIds, store }: { bannerIds: string[]; store: StoreContext }) {
  const banners = await bannersForStore(store, await getBanners(bannerIds.length ? { ids: bannerIds } : { placement: "PROMO" }));
  if (banners.length === 0) return null;
  return (
    <section className="py-6 md:py-10">
      <div className={cn("container-page grid gap-4 md:gap-5", banners.length > 1 && "md:grid-cols-2")}>
        {banners.slice(0, 2).map((banner) => (
          <div key={banner.id} className="aspect-[4/5] sm:aspect-[5/4]">
            <BannerTile banner={banner} sizes="(min-width: 768px) 48vw, 100vw" />
          </div>
        ))}
      </div>
    </section>
  );
}

async function Editorial({ bannerId, align, store }: { bannerId?: string; align: "left" | "right"; store: StoreContext }) {
  if (!bannerId) return null;
  const [banner] = await bannersForStore(store, await getBanners({ ids: [bannerId] }));
  if (!banner) return null;
  return (
    <section className="py-12 md:py-16">
      <div className="container-page">
        <div className={cn("grid overflow-hidden rounded-lg bg-canvas md:grid-cols-2", align === "right" && "md:[&>*:first-child]:order-2")}>
          <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[36rem]">
            {banner.image && <Image src={banner.image.url} alt={banner.image.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />}
          </div>
          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-20">
            {banner.eyebrow && <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-500">{banner.eyebrow}</p>}
            <h2 className="mt-4 text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.03em] text-ink-950 lg:text-6xl">
              <EditorialText text={banner.title} />
            </h2>
            {banner.subtitle && <p className="mt-5 max-w-md text-base leading-relaxed text-ink-600">{banner.subtitle}</p>}
            {banner.ctaLabel && banner.ctaHref && (
              <div className="mt-8">
                <ButtonLink href={banner.ctaHref}>{banner.ctaLabel}</ButtonLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

async function BrandStrip({ title, slugs, storeId }: { title: string | null; slugs: string[]; storeId: string }) {
  const brands = await getFeaturedBrands(slugs, storeId);
  if (brands.length === 0) return null;
  return (
    <section className="border-y border-line py-12 md:py-16">
      <div className="container-page">
        <SectionHeading title={title ?? "Our labels"} action={{ label: "All brands", href: "/brands" }} />
        <ul className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {brands.map((brand) => (
            <li key={brand.id} className="bg-surface">
              <Link href={`/brands/${brand.slug}`} className="group flex h-28 flex-col items-center justify-center px-4 text-center transition-colors hover:bg-canvas">
                <span className="text-[0.8125rem] font-semibold uppercase tracking-[0.2em] text-ink-950">{brand.name}</span>
                <span className="mt-1.5 line-clamp-1 text-[0.75rem] text-ink-500 opacity-0 transition-opacity group-hover:opacity-100">Shop the label →</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function Reviews({ title, limit, storeId }: { title: string | null; limit: number; storeId: string }) {
  const reviews = await getFeaturedReviews(limit, storeId);
  if (reviews.length === 0) return null;
  return (
    <section className="bg-canvas py-14 md:py-20">
      <div className="container-page">
        <SectionHeading title={title ?? "What customers are saying"} />
        <ul className="scrollbar-none -mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {reviews.map((review) => (
            <li key={review.id} className="w-[82vw] shrink-0 snap-start md:w-auto">
              <figure className="flex h-full flex-col rounded-md bg-surface p-6">
                <RatingStars value={review.rating} size="sm" />
                <blockquote className="mt-4 flex-1">
                  <p className="font-medium text-ink-950">{review.title}</p>
                  <p className="mt-2 line-clamp-4 text-[0.9375rem] leading-relaxed text-ink-600">{review.body}</p>
                </blockquote>
                <figcaption className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-[0.8125rem]">
                  <span className="flex items-center gap-1.5 text-ink-800">
                    {review.authorName}
                    {review.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-success">
                        <BadgeCheck className="size-3.5" aria-hidden /> Verified
                      </span>
                    )}
                  </span>
                  <Link href={`/p/${review.product.slug}`} className="truncate text-ink-500 underline decoration-ink-300 underline-offset-2 hover:text-ink-950">
                    {review.product.name}
                  </Link>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Newsletter({ title, text }: { title: string | null; text?: string }) {
  return (
    <section className="py-14 md:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-950 md:text-4xl">
            <EditorialText text={title ?? "Be the _first_ to know"} />
          </h2>
          {text && <p className="mt-3 text-[0.9375rem] text-ink-500">{text}</p>}
          <div className="mx-auto mt-7 max-w-md text-left">
            <NewsletterForm source="home" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Owner stores keep the CMS hero's layout but show their own headline, subtitle and image. */
function storeHero(store: StoreContext, banner: BannerData | undefined): BannerData | null {
  if (store.isPlatformStore) return banner ?? null;
  const base: BannerData = banner ?? { id: `store-hero-${store.id}`, eyebrow: null, title: store.name, subtitle: null, ctaLabel: null, ctaHref: null, theme: "light", image: null, mobileImage: null };
  return {
    ...base,
    eyebrow: store.tagline ?? null,
    title: store.heroTitle || store.name,
    subtitle: store.heroSubtitle ?? null,
    ctaLabel: "Shop now",
    ctaHref: "/shop",
    image: store.heroImageUrl ? { url: store.heroImageUrl, alt: store.name, width: 2400, height: 1350 } : base.image,
    mobileImage: store.heroImageUrl ? null : base.mobileImage,
  };
}

export async function HomeSection({ store, section }: { store: StoreContext; section: { id: string; type: HomeSectionType; title: string | null; subtitle: string | null; config: unknown } }): Promise<ReactNode> {
  switch (section.type) {
    case "HERO": {
      const config = parseHomeSectionConfig("HERO", section.config);
      const banners = await getBanners(config.bannerId ? { ids: [config.bannerId] } : { placement: "HERO" });
      const banner = storeHero(store, banners[0]);
      return banner ? <Hero banner={banner} /> : null;
    }
    case "TRUST_BAR":
      return <TrustBar items={parseHomeSectionConfig("TRUST_BAR", section.config).items} />;
    case "CATEGORY_GRID":
      return <CategoryGrid title={section.title} subtitle={section.subtitle} slugs={parseHomeSectionConfig("CATEGORY_GRID", section.config).categorySlugs} storeId={store.id} />;
    case "PRODUCT_RAIL": {
      const config = parseHomeSectionConfig("PRODUCT_RAIL", section.config);
      const products = await getProductRail(config.source, config.limit, config.categorySlug, scopeOf(store));
      // Data-driven rails (best sellers, trending, top rated) stay hidden until there is real data behind them.
      const minimum = ["best-sellers", "trending", "top-rated"].includes(config.source) ? 4 : 1;
      if (products.length < minimum) return null;
      return (
        <ProductRail
          title={section.title ?? "Products"}
          description={section.subtitle ?? undefined}
          products={products}
          action={config.ctaLabel && config.ctaHref ? { label: config.ctaLabel, href: config.ctaHref } : undefined}
        />
      );
    }
    case "PROMO_BANNERS":
      return <PromoBanners bannerIds={parseHomeSectionConfig("PROMO_BANNERS", section.config).bannerIds} store={store} />;
    case "EDITORIAL": {
      const config = parseHomeSectionConfig("EDITORIAL", section.config);
      return <Editorial bannerId={config.bannerId} align={config.align} store={store} />;
    }
    case "BRAND_STRIP":
      return <BrandStrip title={section.title} slugs={parseHomeSectionConfig("BRAND_STRIP", section.config).brandSlugs} storeId={store.id} />;
    case "REVIEWS":
      return <Reviews title={section.title} limit={parseHomeSectionConfig("REVIEWS", section.config).limit} storeId={store.id} />;
    case "NEWSLETTER":
      return <Newsletter title={section.title} text={parseHomeSectionConfig("NEWSLETTER", section.config).text ?? section.subtitle ?? undefined} />;
    default:
      return null;
  }
}
