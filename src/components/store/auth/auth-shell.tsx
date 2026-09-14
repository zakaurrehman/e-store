import type { ReactNode } from "react";

export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container-page flex justify-center py-12 md:py-20">
      <div className="w-full max-w-[26rem]">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink-950">{title}</h1>
        {description && <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">{description}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8 border-t border-line pt-6 text-center text-[0.9375rem] text-ink-600">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthSkeleton() {
  return (
    <div className="container-page flex justify-center py-12 md:py-20">
      <div className="w-full max-w-[26rem] space-y-4" aria-busy>
        <div className="skeleton h-9 w-2/3 rounded-sm" />
        <div className="skeleton mt-8 h-11 rounded-sm" />
        <div className="skeleton h-11 rounded-sm" />
        <div className="skeleton h-12 rounded-sm" />
      </div>
    </div>
  );
}
