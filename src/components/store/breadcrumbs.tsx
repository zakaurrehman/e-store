import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { breadcrumbJsonLd, JsonLd } from "@/components/seo/json-ld";
import { cn } from "@/utils/cn";

export type Crumb = { name: string; href: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const all = [{ name: "Home", href: "/" }, ...items];
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(all)} />
      <nav aria-label="Breadcrumb" className={cn("text-[0.8125rem] text-ink-500", className)}>
        <ol className="scrollbar-none flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
          {all.map((item, index) => {
            const last = index === all.length - 1;
            return (
              <li key={item.href} className="flex items-center gap-1.5">
                {last ? (
                  <span aria-current="page" className="text-ink-800">
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link href={item.href} className="transition-colors hover:text-ink-950">
                      {item.name}
                    </Link>
                    <ChevronRight className="size-3 text-ink-300" aria-hidden />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
