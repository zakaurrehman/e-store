import { SectionHeading } from "@/components/ui/misc";
import type { ProductCardData } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";
import { ProductCard } from "./product-card";

export function ProductRail({
  title,
  eyebrow,
  description,
  products,
  action,
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  products: ProductCardData[];
  action?: { label: string; href: string };
  className?: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className={cn("py-12 md:py-16", className)} aria-label={title}>
      <div className="container-page">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} action={action} />
      </div>
      <div className="container-page mt-7">
        <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:gap-5 md:-mx-8 md:px-8 xl:mx-0 xl:grid xl:grid-cols-4 xl:gap-y-10 xl:overflow-visible xl:px-0">
          {products.map((product) => (
            <li key={product.id} className="w-[44vw] shrink-0 snap-start sm:w-[32vw] md:w-[28vw] xl:w-auto">
              <ProductCard product={product} sizes="(min-width: 1280px) 22vw, (min-width: 768px) 28vw, 44vw" />
            </li>
          ))}
        </ul>
        {action && (
          <a href={action.href} className="mt-6 inline-flex text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 sm:hidden">
            {action.label}
          </a>
        )}
      </div>
    </section>
  );
}
