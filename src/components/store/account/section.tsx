import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function AccountSection({ title, description, action, children, className }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`} className="text-xl font-semibold tracking-[-0.015em]">
            {title}
          </h2>
          {description && <p className="mt-1 text-[0.9375rem] text-ink-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}
