import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { listBrands } from "@/features/catalog/queries";

export const metadata: Metadata = {
  title: "Our labels",
  description: "Discover the independent labels and house brands available at Zendropship.",
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  const brands = (await listBrands()).filter((brand) => brand.productCount > 0);
  const groups = new Map<string, typeof brands>();
  for (const brand of [...brands].sort((a, b) => a.name.localeCompare(b.name))) {
    const letter = brand.name[0].toUpperCase();
    groups.set(letter, [...(groups.get(letter) ?? []), brand]);
  }
  return (
    <div className="container-page pb-20 pt-6">
      <Breadcrumbs items={[{ name: "Brands", href: "/brands" }]} />
      <header className="mt-6 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">Our labels</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-600">Every label on Zendropship is reviewed for materials, construction and how it treats the people who make it.</p>
      </header>

      <section aria-label="Featured labels" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands
          .filter((brand) => brand.isFeatured)
          .map((brand) => (
            <Link key={brand.id} href={`/brands/${brand.slug}`} className="group flex min-h-48 flex-col justify-between rounded-lg bg-canvas p-7 transition-colors hover:bg-canvas-deep">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-950">{brand.name}</p>
              <div>
                <p className="line-clamp-2 text-[0.9375rem] text-ink-600">{brand.description}</p>
                <p className="mt-4 text-sm font-medium text-ink-950">
                  {brand.productCount} products <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </p>
              </div>
            </Link>
          ))}
      </section>

      <section aria-label="All labels A to Z" className="mt-16">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">A–Z</h2>
        <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {[...groups.entries()].map(([letter, items]) => (
            <div key={letter}>
              <p className="border-b border-line pb-2 font-display text-3xl italic text-ink-400">{letter}</p>
              <ul className="mt-3 space-y-2">
                {items.map((brand) => (
                  <li key={brand.id}>
                    <Link href={`/brands/${brand.slug}`} className="flex justify-between text-[0.9375rem] text-ink-800 hover:text-ink-950 hover:underline hover:underline-offset-4">
                      {brand.name}
                      <span className="tabular text-ink-400">{brand.productCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
