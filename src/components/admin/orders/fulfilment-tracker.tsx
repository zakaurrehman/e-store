import { Check, CircleDashed, XCircle } from "lucide-react";
import { dateTime } from "@/components/admin/ui";
import type { FulfilmentStage } from "@/features/orders/progress";
import { cn } from "@/utils/cn";

/**
 * Where an order is in fulfilment: every stage, when it happened and who moved it. Read from the order's
 * own event log, so it is the same history the owner and the customer see.
 */
export function FulfilmentTracker({ stages, cancelled }: { stages: FulfilmentStage[]; cancelled?: { at: Date; by: string | null; reason: string } | null }) {
  if (cancelled) {
    return (
      <div className="flex gap-3 rounded-md bg-danger-soft px-4 py-3">
        <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="text-sm">
          <p className="font-medium text-ink-950">Cancelled — fulfilment stopped</p>
          <p className="mt-0.5 text-ink-700">{cancelled.reason}</p>
          <p className="mt-0.5 text-[0.75rem] text-ink-500">
            {dateTime.format(cancelled.at)}
            {cancelled.by ? ` · ${cancelled.by}` : " · System"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol className="relative">
      {stages.map((stage, index) => (
        <li key={stage.status} className="relative flex gap-3.5 pb-5 last:pb-0">
          {index < stages.length - 1 && <span className={cn("absolute left-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-px", stage.done ? "bg-success" : "bg-line")} aria-hidden />}
          <span
            className={cn(
              "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold",
              stage.done ? "border-success bg-success text-white" : "border-line-strong bg-surface text-ink-400",
              stage.current && "ring-4 ring-success/15",
            )}
          >
            {stage.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("text-[0.9375rem]", stage.done ? "font-medium text-ink-950" : "text-ink-500")}>
              {stage.label}
              {stage.current && index < stages.length - 1 && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-success">Now</span>}
            </p>
            {stage.at ? (
              <p className="text-[0.75rem] text-ink-500">
                {dateTime.format(stage.at)}
                {stage.by ? ` · ${stage.by}` : " · System"}
              </p>
            ) : (
              <p className="text-[0.75rem] text-ink-400">Not yet</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
