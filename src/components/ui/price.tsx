import { cn } from "@/utils/cn";
import { discountPercent, formatMoney } from "@/utils/money";

type PriceProps = {
  cents: number;
  compareAtCents?: number | null;
  currency?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showDiscount?: boolean;
  /** Prefix "From" when a product has multiple price points. */
  from?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: "text-sm",
  md: "text-[0.9375rem]",
  lg: "text-lg",
  xl: "text-2xl",
};

export function Price({ cents, compareAtCents, currency = "USD", size = "md", showDiscount = false, from, className }: PriceProps) {
  const onSale = !!compareAtCents && compareAtCents > cents;
  const percent = onSale ? discountPercent(compareAtCents!, cents) : 0;
  return (
    <span className={cn("tabular inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", sizeClasses[size], className)}>
      {from && <span className="text-[0.85em] font-normal text-ink-500">From</span>}
      <span className={cn("font-medium", onSale ? "text-sale" : "text-ink-950")}>
        {onSale && <span className="sr-only">Sale price </span>}
        {formatMoney(cents, currency)}
      </span>
      {onSale && (
        <>
          <s className="text-[0.88em] font-normal text-ink-400 decoration-ink-400/70">
            <span className="sr-only">Regular price </span>
            {formatMoney(compareAtCents!, currency)}
          </s>
          {showDiscount && percent > 0 && <span className="text-[0.8em] font-semibold text-sale">−{percent}%</span>}
        </>
      )}
    </span>
  );
}
