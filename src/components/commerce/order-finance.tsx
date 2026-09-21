import { Info } from "lucide-react";
import { COMMISSION_BASE_LABELS, formatRate, type OrderFinance } from "@/features/finance/order-finance";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

/**
 * One order's money, shown the same way everywhere: owner dashboard, admin order page and invoices all
 * render this from the figures stored on the order, so no two screens can disagree.
 */
export function OrderFinanceTable({
  finance,
  currency,
  audience = "owner",
  className,
}: {
  finance: OrderFinance;
  currency: string;
  /** "owner" says "you"; "staff" names the store owner. */
  audience?: "owner" | "staff";
  className?: string;
}) {
  const passThrough = finance.shippingCents + finance.taxCents;
  const rows: Array<{ label: string; value: number; hint?: string; strong?: boolean; tone?: "credit" | "debit" | "plain" }> = [
    { label: "Customer paid", value: finance.customerPaidCents, hint: "The total charged at checkout", strong: true },
    ...(finance.discountCents > 0 ? [{ label: "Discount given", value: -finance.discountCents, hint: "Taken off the goods, so it comes out of the margin", tone: "debit" as const }] : []),
    ...(passThrough > 0 ? [{ label: "Shipping & tax", value: passThrough, hint: "Collected for delivery and tax — not part of the margin", tone: "plain" as const }] : []),
    { label: "Goods sold", value: finance.revenueCents, hint: "What the items sold for, after discount" },
    { label: "Fulfilment cost", value: -finance.fulfilmentCostCents, hint: audience === "owner" ? "Wholesale, charged to your balance" : "Wholesale charged to the owner's balance", tone: "debit" },
    {
      label: `Zendropship commission${finance.commissionRateBps > 0 ? ` (${formatRate(finance.commissionRateBps)})` : ""}`,
      value: -finance.commissionCents,
      hint: finance.commissionRateBps > 0 ? `${formatRate(finance.commissionRateBps)} of ${COMMISSION_BASE_LABELS[finance.commissionBase].toLowerCase()}` : "No commission on this order",
      tone: "debit",
    },
    { label: audience === "owner" ? "You earn" : "Owner earns", value: finance.ownerEarningCents, strong: true, tone: "credit" },
  ];

  return (
    <div className={className}>
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <dt className={cn("text-[0.9375rem]", row.strong ? "font-medium text-ink-950" : "text-ink-800")}>{row.label}</dt>
              {row.hint && <p className="text-[0.75rem] text-ink-500">{row.hint}</p>}
            </div>
            <dd
              className={cn(
                "tabular shrink-0 text-[0.9375rem]",
                row.strong && "text-base font-semibold",
                row.tone === "credit" ? (row.value >= 0 ? "text-success" : "text-danger") : row.tone === "debit" ? "text-ink-700" : "text-ink-950",
              )}
            >
              {row.value < 0 ? `−${formatMoney(Math.abs(row.value), currency)}` : formatMoney(row.value, currency)}
            </dd>
          </div>
        ))}
      </dl>
      {finance.ownerEarningCents < 0 && (
        <p className="mt-3 flex gap-2 rounded-sm bg-warning/10 px-3 py-2 text-[0.8125rem] text-ink-800">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          This order sells for less than it costs to fulfil, so it loses money. Check the selling price.
        </p>
      )}
    </div>
  );
}
