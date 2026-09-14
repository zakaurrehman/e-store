import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";

export type BadgeTone = "neutral" | "ink" | "sale" | "iris" | "success" | "warning" | "danger" | "info" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-canvas text-ink-700",
  ink: "bg-ink-950 text-white",
  sale: "bg-sale text-white",
  iris: "bg-iris-100 text-iris-700",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  outline: "border border-line-strong text-ink-700",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-xs px-1.5 text-2xs font-semibold uppercase tracking-[0.06em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
