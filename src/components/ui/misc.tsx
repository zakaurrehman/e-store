import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-sm", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", className)}>
      {icon && <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-canvas text-ink-700">{icon}</div>}
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink-950">{title}</h2>
      {description && <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-7 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: { label: string; href: string };
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className={cn("flex items-end justify-between gap-6", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">{eyebrow}</p>}
        <Heading className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-950 md:text-[1.75rem]">{title}</Heading>
        {description && <p className="mt-2 max-w-xl text-[0.9375rem] text-ink-500">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="group hidden shrink-0 items-center gap-1.5 text-sm font-medium text-ink-950 sm:inline-flex"
        >
          <span className="underline decoration-ink-300 underline-offset-4 transition-colors group-hover:decoration-ink-950">{action.label}</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      )}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children?: ReactNode; className?: string }) {
  const toneClass = {
    info: "border-info/20 bg-info-soft text-info",
    success: "border-success/20 bg-success-soft text-success",
    warning: "border-warning/20 bg-warning-soft text-warning",
    danger: "border-danger/20 bg-danger-soft text-danger",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-sm border px-4 py-3 text-sm leading-relaxed", toneClass, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}
