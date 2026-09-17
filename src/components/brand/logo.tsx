import { cn } from "@/utils/cn";

type SvgProps = { className?: string; title?: string };

/**
 * ZENDROPSHIP wordmark — the interface typeface (Instrument Sans) in tracked capitals.
 * Rendered as text so it inherits the surrounding colour; size it with a text-size utility.
 */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("inline-block whitespace-nowrap font-sans text-[0.9375rem] font-semibold uppercase leading-none tracking-[0.2em]", className)}>Zendropship</span>;
}

/** Monogram: a Z whose horizontal strokes are ink-on-white and whose diagonal is iris — the brand's accent cutting across. */
export function LogoMark({ className, title = "Zendropship" }: SvgProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn("size-8", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <rect width="64" height="64" rx="14" fill="#0b0c0e" />
      <path d="M20 15H44V22H20Z" fill="#ffffff" />
      <path d="M20 42H44V49H20Z" fill="#ffffff" />
      <path d="M33.5 22H44L30.5 42H20Z" fill="#5446ff" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink-950", className)}>
      <LogoMark className={cn("size-7", markClassName)} title="" />
      <Wordmark />
    </span>
  );
}
