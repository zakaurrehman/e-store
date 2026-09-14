import { cn } from "@/utils/cn";

type SvgProps = { className?: string; title?: string };

/**
 * VEYORA wordmark — geometric monoline letterforms drawn as filled paths (no font dependency).
 * Cap height 100 units; stroke weight ≈10.5 units.
 */
export function Wordmark({ className, title = "Veyora" }: SvgProps) {
  return (
    <svg
      viewBox="0 0 638 100"
      role="img"
      aria-label={title}
      className={cn("h-4 w-auto fill-current", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* V */}
      <path d="M0 0H11L40 82L69 0H80L45.5 100H34.5Z" />
      {/* E */}
      <path d="M114 0H172V10.5H124.5V44.75H166V55.25H124.5V89.5H172V100H114Z" />
      {/* Y */}
      <path d="M206 0H218.5L245 38L271.5 0H284L250.25 48.5V100H239.75V48.5Z" />
      {/* O */}
      <path
        fillRule="evenodd"
        d="M418 50A50 50 0 1 0 318 50A50 50 0 1 0 418 50ZM407.5 50A39.5 39.5 0 1 0 328.5 50A39.5 39.5 0 1 0 407.5 50Z"
      />
      {/* R */}
      <path d="M452 0H491A29 29 0 0 1 491 58H452ZM462.5 10.5V47.5H491A18.5 18.5 0 0 0 491 10.5Z M452 0H462.5V100H452Z M481 52H493.5L524 100H511.5Z" />
      {/* A */}
      <path d="M558 100H569L598 18L627 100H638L603.5 0H592.5Z M575 62V72.5H621V62Z" />
    </svg>
  );
}

/** Monogram: interlocking V — ink stroke meets an iris stroke (the customer and the brand converging). */
export function LogoMark({ className, title = "Veyora" }: SvgProps) {
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
      <path d="M17 19H24L35.5 45H28.5Z" fill="#ffffff" />
      <path d="M40 19H47L35.5 45H28.5Z" fill="#5446ff" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink-950", className)}>
      <LogoMark className={cn("size-7", markClassName)} title="" />
      <Wordmark className="h-3.5" />
    </span>
  );
}
