"use client";

import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, LifeBuoy, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
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

/** Details for owners: where Zendropship receives money, set by staff in Settings → Owner deposits. */
export type DepositDetails = { bankDetails: string; cryptoNetwork: string; cryptoAddress: string; instructions: string };

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 flex-1 break-all font-mono text-[0.8125rem] text-ink-900">{value}</span>
      <button
        type="button"
        className="shrink-0 rounded-xs p-1 text-ink-500 hover:text-ink-950"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </span>
  );
}

/** Money questions that the forms can't answer go to Zendropship support. */
function SupportLink({ children = "Questions about deposits or withdrawals? Contact Zendropship support" }: { children?: React.ReactNode }) {
  return (
    <a href="/contact" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
      <LifeBuoy className="size-3.5" aria-hidden /> {children}
    </a>
  );
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
          <SupportLink>Need help with a withdrawal? Contact Zendropship support</SupportLink>
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

export function DepositDialog({ minimumCents, supportEmail, details }: { minimumCents: number; supportEmail: string | null; details: DepositDetails }) {
  const [open, setOpen] = useState(false);
  const cryptoOffered = !!details.cryptoAddress.trim();
  const [method, setMethod] = useState<"BANK_TRANSFER" | "CRYPTO">("BANK_TRANSFER");
  const [proofName, setProofName] = useState<string | null>(null);
  const proofRef = useRef<HTMLInputElement>(null);
  const [state, action] = useDialogAction(recordDepositAction, () => {
    setOpen(false);
    setProofName(null);
  });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <ArrowDownToLine className="size-4" aria-hidden /> Deposit
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add funds to your balance" description="Tell us about a transfer you have made">
        <form action={action} className="space-y-5">
          <p className="rounded-sm bg-canvas px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink-600">
            {details.instructions || "Send the money to Zendropship first, then record it here. Your balance changes only once we confirm the transfer arrived — nothing is credited automatically."}
          </p>

          {cryptoOffered && (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 block text-[0.8125rem] font-medium text-ink-800">How did you send it?</legend>
              {(
                [
                  ["BANK_TRANSFER", "Bank transfer"],
                  ["CRYPTO", details.cryptoNetwork ? `Crypto — ${details.cryptoNetwork}` : "Crypto"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 rounded-sm border border-line px-3 py-2.5 text-[0.9375rem] has-[:checked]:border-ink-950">
                  <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="accent-ink-950" />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {!cryptoOffered && <input type="hidden" name="method" value="BANK_TRANSFER" />}
          {method === "CRYPTO" && <input type="hidden" name="network" value={details.cryptoNetwork} />}

          {method === "BANK_TRANSFER" && details.bankDetails.trim() && (
            <div className="rounded-sm border border-line p-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">Send the bank transfer to</p>
              <p className="mt-1.5 whitespace-pre-line text-[0.8125rem] leading-relaxed text-ink-900">{details.bankDetails}</p>
            </div>
          )}
          {method === "CRYPTO" && (
            <div className="rounded-sm border border-line p-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">Send {details.cryptoNetwork || "crypto"} to</p>
              <div className="mt-1.5">
                <CopyValue value={details.cryptoAddress} label="wallet address" />
              </div>
              <p className="mt-2 text-[0.75rem] text-ink-500">Check the address and network carefully — transfers on the wrong network cannot be recovered.</p>
            </div>
          )}
          {method === "BANK_TRANSFER" && !details.bankDetails.trim() && supportEmail && (
            <p className="text-[0.8125rem] text-ink-600">Ask {supportEmail} for the account details before you transfer.</p>
          )}

          <TextField name="amount" label="Amount transferred (USD)" inputMode="decimal" required error={fieldError(state, "amount")} hint={`At least ${formatMoney(minimumCents)}.`} />
          <TextField
            name="reference"
            label={method === "CRYPTO" ? "Transaction id (hash)" : "Transfer reference"}
            optional={method !== "CRYPTO"}
            maxLength={120}
            hint={method === "CRYPTO" ? "From your wallet or the block explorer, so we can find the transfer." : "The reference on your bank transfer, so we can match it."}
            error={fieldError(state, "reference")}
          />

          <Field label="Screenshot of the transfer" htmlFor="deposit-proof" optional={method !== "CRYPTO"} hint="JPEG, PNG or WebP, up to 10 MB. It helps us confirm faster." error={fieldError(state, "proof")}>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={proofRef} id="deposit-proof" type="file" name="proof" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => setProofName(event.target.files?.[0]?.name ?? null)} />
              <Button variant="secondary" size="sm" onClick={() => proofRef.current?.click()} className="gap-1.5">
                <Upload className="size-4" aria-hidden /> {proofName ? "Choose another" : "Upload screenshot"}
              </Button>
              {proofName && <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-600">{proofName}</span>}
            </div>
          </Field>

          <TextField name="note" label="Note" optional maxLength={300} error={fieldError(state, "note")} />
          <SupportLink>Not sure where to send the money? Contact Zendropship support</SupportLink>
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
  depositDetails,
  compact,
}: {
  summary: {
    balanceCents: number;
    availableCents: number;
    pendingCents: number;
    pendingPayoutCents: number;
    pendingPayoutCount: number;
    pendingDepositCents: number;
    pendingDepositCount: number;
    totalDepositedCents: number;
    earnedTodayCents: number;
    earnedThisWeekCents: number;
    earnedThisMonthCents: number;
  };
  minimumPayoutCents: number;
  minimumDepositCents: number;
  supportEmail: string | null;
  depositDetails: DepositDetails;
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
        <dl className="mt-3 space-y-1 text-[0.8125rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-600" title="Money that has been collected and can be withdrawn now.">
              Available to withdraw
            </dt>
            <dd className="tabular font-medium text-ink-950">{formatMoney(summary.availableCents)}</dd>
          </div>
          {summary.pendingCents !== 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-600" title="Cash-on-delivery orders: yours once the parcel is paid for on arrival.">
                On its way
              </dt>
              <dd className="tabular font-medium text-warning">{formatMoney(summary.pendingCents)}</dd>
            </div>
          )}
          {summary.pendingPayoutCount > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-600">
                In {summary.pendingPayoutCount} withdrawal{summary.pendingPayoutCount === 1 ? "" : "s"}
              </dt>
              <dd className="tabular font-medium text-ink-700">{formatMoney(summary.pendingPayoutCents)}</dd>
            </div>
          )}
          {summary.pendingDepositCount > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-warning">
                {summary.pendingDepositCount} deposit{summary.pendingDepositCount === 1 ? "" : "s"} to confirm
              </dt>
              <dd className="tabular font-medium text-warning">{formatMoney(summary.pendingDepositCents)}</dd>
            </div>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <WithdrawDialog balanceCents={summary.availableCents} minimumCents={minimumPayoutCents} disabled={summary.availableCents < minimumPayoutCents} />
          <DepositDialog minimumCents={minimumDepositCents} supportEmail={supportEmail} details={depositDetails} />
        </div>
        {summary.availableCents < minimumPayoutCents && <p className="mt-2 text-[0.8125rem] text-ink-500">Withdrawals start at {formatMoney(minimumPayoutCents)}.</p>}
        <p className="mt-3">
          <SupportLink />
        </p>
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
        <p className="mt-2 text-[0.8125rem] text-ink-500">What you keep after the wholesale cost and Zendropship&rsquo;s commission.</p>
      </div>
    </div>
  );
}
