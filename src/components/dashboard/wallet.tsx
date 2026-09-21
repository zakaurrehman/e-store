"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { recordDepositAction, requestPayoutAction } from "@/features/wallet/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

/** Closes the dialog, toasts and refreshes the page once an action succeeds. */
function useDialogAction(action: (state: ActionState, formData: FormData) => Promise<ActionState>, onDone: () => void) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, idleState);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.message) toast({ title: state.message });
    onDone();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return [state, formAction] as const;
}

export function WithdrawDialog({ balanceCents, minimumCents, disabled }: { balanceCents: number; minimumCents: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useDialogAction(requestPayoutAction, () => setOpen(false));
  const [method, setMethod] = useState<"BANK_TRANSFER" | "PAYPAL">("BANK_TRANSFER");
  const available = formatMoney(balanceCents);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled} className="gap-1.5">
        <ArrowUpFromLine className="size-4" aria-hidden /> Withdraw
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Withdraw your balance" description={`${available} available`}>
        <form action={action} className="space-y-5">
          <TextField
            name="amount"
            label="Amount (USD)"
            inputMode="decimal"
            placeholder={(balanceCents / 100).toFixed(2)}
            required
            error={fieldError(state, "amount")}
            hint={`Between ${formatMoney(minimumCents)} and ${available}.`}
          />
          <fieldset className="space-y-2">
            <legend className="mb-1.5 block text-[0.8125rem] font-medium text-ink-800">Send it to</legend>
            {(
              [
                ["BANK_TRANSFER", "Bank transfer"],
                ["PAYPAL", "PayPal"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-sm border border-line px-3 py-2.5 text-[0.9375rem] has-[:checked]:border-ink-950">
                <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="accent-ink-950" />
                {label}
              </label>
            ))}
          </fieldset>
          <Field
            label={method === "PAYPAL" ? "PayPal email address" : "Bank account details"}
            htmlFor="payout-destination"
            error={fieldError(state, "destination")}
            hint={method === "PAYPAL" ? "The address that should receive the payment." : "Account holder, IBAN or account and sort code."}
          >
            {method === "PAYPAL" ? (
              <Input id="payout-destination" name="destination" type="email" required maxLength={200} placeholder="you@example.com" />
            ) : (
              <Textarea id="payout-destination" name="destination" rows={3} required maxLength={200} placeholder="Maya Okafor · IBAN GB00 XXXX 0000 0000" />
            )}
          </Field>
          <TextField name="note" label="Note for Zendropship" optional maxLength={300} error={fieldError(state, "note")} />
          <p className="rounded-sm bg-canvas px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink-600">
            The amount leaves your balance now and is sent by Zendropship. If the withdrawal is declined, it goes straight back to your balance.
          </p>
          {state.status === "error" && <FormMessage state={state} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Requesting…">Request withdrawal</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function DepositDialog({ minimumCents, supportEmail }: { minimumCents: number; supportEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useDialogAction(recordDepositAction, () => setOpen(false));
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <ArrowDownToLine className="size-4" aria-hidden /> Deposit
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add funds to your balance" description="Tell us about a transfer you have made">
        <form action={action} className="space-y-5">
          <p className="rounded-sm bg-canvas px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink-600">
            Send the money to Zendropship first{supportEmail ? <> (ask {supportEmail} for the account details)</> : null}, then record it here. Your balance changes only once we confirm the transfer
            arrived — nothing is credited automatically.
          </p>
          <TextField name="amount" label="Amount transferred (USD)" inputMode="decimal" required error={fieldError(state, "amount")} hint={`At least ${formatMoney(minimumCents)}.`} />
          <TextField name="reference" label="Transfer reference" optional maxLength={120} hint="The reference on your bank transfer, so we can match it." error={fieldError(state, "reference")} />
          <TextField name="note" label="Note" optional maxLength={300} error={fieldError(state, "note")} />
          {state.status === "error" && <FormMessage state={state} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Recording…">Record deposit</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Balance, what is on hold, and the earnings periods — the money summary shared by the dashboard pages. */
export function BalancePanel({
  summary,
  minimumPayoutCents,
  minimumDepositCents,
  supportEmail,
  compact,
}: {
  summary: { balanceCents: number; pendingPayoutCents: number; pendingPayoutCount: number; pendingDepositCount: number; earnedTodayCents: number; earnedThisWeekCents: number; earnedThisMonthCents: number };
  minimumPayoutCents: number;
  minimumDepositCents: number;
  supportEmail: string | null;
  compact?: boolean;
}) {
  const periods = [
    { label: "Today", value: summary.earnedTodayCents },
    { label: "This week", value: summary.earnedThisWeekCents },
    { label: "This month", value: summary.earnedThisMonthCents },
  ];
  return (
    <div className={cn("grid gap-4", compact ? "sm:grid-cols-2" : "lg:grid-cols-2")}>
      <div className="rounded-lg border border-line bg-surface p-5">
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Balance</p>
        <p className="tabular mt-2 text-3xl font-semibold tracking-[-0.02em] text-ink-950">{formatMoney(summary.balanceCents)}</p>
        <p className="mt-1 text-[0.8125rem] text-ink-500">
          {summary.pendingPayoutCount > 0
            ? `${formatMoney(summary.pendingPayoutCents)} in ${summary.pendingPayoutCount} withdrawal${summary.pendingPayoutCount === 1 ? "" : "s"} being sent`
            : "Yours to withdraw whenever you like"}
        </p>
        {summary.pendingDepositCount > 0 && (
          <p className="mt-1 text-[0.8125rem] text-warning">
            {summary.pendingDepositCount} deposit{summary.pendingDepositCount === 1 ? "" : "s"} waiting to be confirmed
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <WithdrawDialog balanceCents={summary.balanceCents} minimumCents={minimumPayoutCents} disabled={summary.balanceCents < minimumPayoutCents} />
          <DepositDialog minimumCents={minimumDepositCents} supportEmail={supportEmail} />
        </div>
        {summary.balanceCents < minimumPayoutCents && (
          <p className="mt-2 text-[0.8125rem] text-ink-500">Withdrawals start at {formatMoney(minimumPayoutCents)}.</p>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Earnings</p>
        <dl className="mt-3 divide-y divide-line">
          {periods.map((period) => (
            <div key={period.label} className="flex items-baseline justify-between py-2.5">
              <dt className="text-[0.9375rem] text-ink-700">{period.label}</dt>
              <dd className={cn("tabular text-lg font-semibold", period.value > 0 ? "text-success" : "text-ink-950")}>{formatMoney(period.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[0.8125rem] text-ink-500">Your margin on orders whose payment has been collected.</p>
      </div>
    </div>
  );
}
