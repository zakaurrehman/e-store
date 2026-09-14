import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

export function PageHeader({ title, description, actions, breadcrumb }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: Array<{ label: string; href?: string }> }) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-[0.8125rem] text-ink-500">
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-ink-950">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-ink-800">{crumb.label}</span>
              )}
              {index < breadcrumb.length - 1 && <ChevronRight className="size-3 text-ink-300" aria-hidden />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">{title}</h1>
          {description && <p className="mt-1 text-[0.9375rem] text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, className, padded = true }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="text-[0.9375rem] font-semibold">{title}</h2>}
            {description && <p className="text-[0.8125rem] text-ink-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warning" | "danger"; href?: string }) {
  const inner = (
    <>
      <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className={cn("tabular mt-2 text-2xl font-semibold tracking-[-0.02em]", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className="mt-1 text-[0.8125rem] text-ink-500">{hint}</p>}
    </>
  );
  const className = "block rounded-lg border border-line bg-surface p-5";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:border-ink-950")}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[40rem] text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("border-b border-line px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500 first:pl-5 last:pr-5", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle text-ink-800 first:pl-5 last:pr-5", className)} {...props} />;
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">
        {children}
      </td>
    </tr>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <Badge tone={tone}>{label}</Badge>;
}

export function buildQuery(base: Record<string, string | string[] | undefined>, overrides: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function AdminPagination({ basePath, query, page, pageCount, total, pageSize }: { basePath: string; query: Record<string, string | string[] | undefined>; page: number; pageCount: number; total: number; pageSize: number }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex size-9 items-center justify-center rounded-sm border border-line text-ink-700 hover:border-ink-950 hover:text-ink-950";
  const disabled = "inline-flex size-9 items-center justify-center rounded-sm border border-line text-ink-300";
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 text-[0.8125rem] text-ink-500">
      <span className="tabular">
        {from}–{to} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Link href={`${basePath}${buildQuery(query, { page: page - 1 })}`} className={link} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className={disabled}>
            <ChevronLeft className="size-4" />
          </span>
        )}
        {page < pageCount ? (
          <Link href={`${basePath}${buildQuery(query, { page: page + 1 })}`} className={link} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={disabled}>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}

export function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex h-8 items-center rounded-full px-3 text-[0.8125rem] transition-colors", active ? "bg-ink-950 text-white" : "bg-surface text-ink-700 ring-1 ring-line hover:ring-ink-950")}>
      {children}
    </Link>
  );
}

export function DescriptionList({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line text-sm", className)}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[8rem_1fr] gap-3 py-2">
          <dt className="text-ink-500">{item.label}</dt>
          <dd className="min-w-0 break-words text-ink-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
export const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
