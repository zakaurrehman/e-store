import { cn } from "@/utils/cn";

const STAR = "M8 1.2l2.03 4.26 4.67.6-3.43 3.23.87 4.63L8 11.66l-4.14 2.26.87-4.63L1.3 6.06l4.67-.6L8 1.2z";

export function RatingStars({ value, className, size = "sm" }: { value: number; className?: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const clamped = Math.max(0, Math.min(5, value));
  const dimension = { xs: "size-3", sm: "size-3.5", md: "size-4", lg: "size-5" }[size];
  return (
    <span className={cn("inline-flex items-center gap-px", className)} role="img" aria-label={`Rated ${clamped.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, clamped - index));
        return (
          <svg key={index} viewBox="0 0 16 16" className={cn(dimension, "shrink-0")} aria-hidden>
            <path d={STAR} fill="var(--color-ink-200)" />
            {fill > 0 && (
              <>
                <clipPath id={`star-${index}-${Math.round(fill * 100)}`}>
                  <rect width={16 * fill} height="16" />
                </clipPath>
                <path d={STAR} fill="var(--color-ink-950)" clipPath={`url(#star-${index}-${Math.round(fill * 100)})`} />
              </>
            )}
          </svg>
        );
      })}
    </span>
  );
}

export function RatingSummary({ average, count, className }: { average: number; count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-600", className)}>
      <RatingStars value={average} size="xs" />
      <span className="tabular">
        {average.toFixed(1)} <span className="text-ink-400">({count})</span>
      </span>
    </span>
  );
}
