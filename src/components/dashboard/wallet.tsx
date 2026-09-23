"use client";

import { ArrowDownToLine, ArrowUpFromLine, LifeBuoy, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, TextField } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { recordDepositAction, requestPayoutAction } from "@/features/wallet/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { looksLikeTrc20Address, looksLikeTrc20TxId, TRC20_LABEL } from "@/lib/tron";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

/**
 * Closes the dialog, toasts and refreshes the page once an action succeeds.
 * The form is submitted by hand rather than through `<form action>`: React clears a form after every
 * action, and a refused request has to keep what the owner typed (and the chosen screenshot) so they can
 * correct the one field that was wrong. It is cleared only when the request goes through.
 */
function useDialogAction(action: (state: ActionState, formData: FormData) => Promise<ActionState>, onDone: () => void) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.message) toast({ title: state.message });
    formRef.current?.reset();
    onDone();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
  return { state, formRef, onSubmit, pending };
}

/** Details for owners: where Zendropship receives money, set by staff in Settings → Owner deposits. */
export type DepositDetails = { bankDetails: string; trc20Address: string; cryptoNetwork: string; cryptoAddress: string; instructions: string };

/** Money questions the forms can't answer open a thread with Zendropship, kept in the dashboard. */
function SupportLink({ children = "Questions about deposits or withdrawals? Ask Zendropship", href = "/dashboard/support/tickets/new" }: { children?: React.ReactNode; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
      <LifeBuoy className="size-3.5" aria-hidden /> {children}
    </Link>
  );
}

/**
 * A TRC20 field that says, as it is typed, whether the value has the right shape. Only the server can
 * check an address's checksum, so once it has refused this exact value the hint stays quiet and its error
 * speaks alone.
 */
function Trc20Hint({ value, kind, refused }: { value: string; kind: "address" | "txid"; refused?: boolean }) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ok = kind === "address" ? looksLikeTrc20Address(trimmed) : looksLikeTrc20TxId(trimmed);
  if (ok && refused) return null;
  return (
    <p className={cn("mt-1.5 text-[0.75rem]", ok ? "text-success" : "text-warning")}>
      {ok
        ? kind === "address"
          ? "Looks like a TRC20 address."
          : "Looks like a TRC20 transaction id."
        : kind === "address"
          ? `A TRC20 address starts with T and is 34 characters (this is ${trimmed.length}).`
          : `A transaction id is 64 letters and numbers (this is ${trimmed.length}).`}
    </p>
  );
}

export function WithdrawDialog({ balanceCents, minimumCents, disabled }: { balanceCents: number; minimumCents: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [sentAddress, setSentAddress] = useState("");
  const { state, formRef, onSubmit, pending } = useDialogAction(requestPayoutAction, () => {
    setOpen(false);
    setAddress("");
  });
  const available = formatMoney(balanceCents);
  const addressError = fieldError(state, "destination");

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled} className="gap-1.5">
        <ArrowUpFromLine className="size-4" aria-hidden /> Withdraw
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Withdraw your balance" description={`${available} available`}>
        <form
          ref={formRef}
          onSubmit={(event) => {
            setSentAddress(address);
            onSubmit(event);
          }}
          className="space-y-5"
        >
          <TextField
            id="payout-amount"
            name="amount"
            label="Amount (USD)"
            inputMode="decimal"
            placeholder={(balanceCents / 100).toFixed(2)}
            required
            error={fieldError(state, "amount")}
            hint={`Between ${formatMoney(minimumCents)} and ${available}.`}
          />
          <input type="hidden" name="method" value="USDT_TRC20" />
          <div className="rounded-sm border border-line p-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">Paid in</p>
            <p className="mt-1 text-[0.9375rem] font-medium text-ink-950">{TRC20_LABEL} · TRON network</p>
            <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-500">Withdrawals are sent in USDT on TRC20 only.</p>
          </div>
          <Field label="Your TRC20 wallet address" htmlFor="payout-destination" error={addressError}>
            <Input
              id="payout-destination"
              name="destination"
              required
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              placeholder="T…"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="font-mono text-[0.875rem]"
            />
            <Trc20Hint value={address} kind="address" refused={!!addressError && address === sentAddress} />
          </Field>
          <TextField id="payout-note" name="note" label="Note for Zendropship" optional maxLength={300} error={fieldError(state, "note")} />
          <p className="rounded-sm border border-warning/40 bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink-800">
            Paste the address from your wallet, and check it is a <strong>TRC20</strong> (TRON) address. A crypto transfer cannot be reversed: money sent to a wrong address or network is lost.
          </p>
          <p className="rounded-sm bg-canvas px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink-600">
            The amount leaves your balance now and is sent by Zendropship. If the withdrawal is declined, it goes straight back to your balance.
          </p>
          <SupportLink href="/dashboard/support/tickets/new?subject=Question%20about%20a%20withdrawal">Need help with a withdrawal? Ask Zendropship</SupportLink>
          {state.status === "error" && <FormMessage state={state} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} aria-label={pending ? "Requesting…" : undefined}>
              Request withdrawal
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

type DepositChoice = "USDT_TRC20" | "BANK_TRANSFER" | "CRYPTO";

export function DepositDialog({ minimumCents, supportEmail, details }: { minimumCents: number; supportEmail: string | null; details: DepositDetails }) {
  const [open, setOpen] = useState(false);
  const trc20Offered = !!details.trc20Address.trim();
  // The older general crypto option stays for other networks, but not as a second USDT (TRC20) choice.
  const cryptoOffered = !!details.cryptoAddress.trim() && !(trc20Offered && /trc-?20/i.test(details.cryptoNetwork));
  // Binance TRC20 first when staff have set an address, then bank transfer, then any other crypto.
  const choices: Array<[DepositChoice, string]> = [
    ...(trc20Offered ? [["USDT_TRC20", `Binance · ${TRC20_LABEL}`] as [DepositChoice, string]] : []),
    ["BANK_TRANSFER", "Bank transfer"],
    ...(cryptoOffered ? [["CRYPTO", details.cryptoNetwork ? `Crypto — ${details.cryptoNetwork}` : "Crypto"] as [DepositChoice, string]] : []),
  ];
  const [method, setMethod] = useState<DepositChoice>(choices[0][0]);
  const [txid, setTxid] = useState("");
  const [proofName, setProofName] = useState<string | null>(null);
  const proofRef = useRef<HTMLInputElement>(null);
  const { state, formRef, onSubmit, pending } = useDialogAction(recordDepositAction, () => {
    setOpen(false);
    setProofName(null);
    setTxid("");
  });
  const onChain = method === "USDT_TRC20" || method === "CRYPTO";

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <ArrowDownToLine className="size-4" aria-hidden /> Deposit
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add funds to your balance" description="Tell us about a transfer you have made">
        <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
          <p className="rounded-sm bg-canvas px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink-600">
            {details.instructions || "Send the money to Zendropship first, then record it here. Your balance changes only once we confirm the transfer arrived — nothing is credited automatically."}
          </p>

          {choices.length > 1 ? (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 block text-[0.8125rem] font-medium text-ink-800">How did you send it?</legend>
              {choices.map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 rounded-sm border border-line px-3 py-2.5 text-[0.9375rem] has-[:checked]:border-ink-950">
                  <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="accent-ink-950" />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : (
            <input type="hidden" name="method" value={method} />
          )}
          {method === "CRYPTO" && <input type="hidden" name="network" value={details.cryptoNetwork} />}

          {method === "USDT_TRC20" && (
            <div className="rounded-sm border border-line p-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">Send {TRC20_LABEL} to this address</p>
              <div className="mt-1.5">
                <CopyValue value={details.trc20Address} label="TRC20 address" />
              </div>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-[0.8125rem] leading-relaxed text-ink-700">
                <li>In Binance, go to Withdraw → USDT.</li>
                <li>
                  Paste the address above and choose the network <strong>TRON (TRC20)</strong>.
                </li>
                <li>After it is sent, open the withdrawal in Binance and copy its TxID into the form below.</li>
              </ol>
              <p className="mt-2 text-[0.75rem] text-warning">Only USDT on TRC20. Anything sent on another network, or another coin, cannot be recovered.</p>
            </div>
          )}

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
          {method === "USDT_TRC20" ? (
            <Field label="Transaction id (TxID)" htmlFor="field-reference" error={fieldError(state, "reference")} hint="64 letters and numbers, from the withdrawal's details in Binance.">
              <Input
                id="field-reference"
                name="reference"
                maxLength={120}
                autoComplete="off"
                spellCheck={false}
                value={txid}
                onChange={(event) => setTxid(event.target.value)}
                className="font-mono text-[0.8125rem]"
              />
              <Trc20Hint value={txid} kind="txid" />
            </Field>
          ) : (
            <TextField
              name="reference"
              label={method === "CRYPTO" ? "Transaction id (hash)" : "Transfer reference"}
              optional={method !== "CRYPTO"}
              maxLength={120}
              hint={method === "CRYPTO" ? "From your wallet or the block explorer, so we can find the transfer." : "The reference on your bank transfer, so we can match it."}
              error={fieldError(state, "reference")}
            />
          )}

          <Field
            label="Screenshot of the transfer"
            htmlFor="deposit-proof"
            optional={!onChain}
            hint={onChain ? "Needed if you do not have the transaction id. JPEG, PNG or WebP, up to 10 MB." : "JPEG, PNG or WebP, up to 10 MB. It helps us confirm faster."}
            error={fieldError(state, "proof")}
          >
            <div className="flex flex-wrap items-center gap-3">
              <input ref={proofRef} id="deposit-proof" type="file" name="proof" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => setProofName(event.target.files?.[0]?.name ?? null)} />
              <Button variant="secondary" size="sm" onClick={() => proofRef.current?.click()} className="gap-1.5">
                <Upload className="size-4" aria-hidden /> {proofName ? "Choose another" : "Upload screenshot"}
              </Button>
              {proofName && <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-600">{proofName}</span>}
            </div>
          </Field>

          <TextField name="note" label="Note" optional maxLength={300} error={fieldError(state, "note")} />
          <SupportLink href="/dashboard/support/tickets/new?subject=Where%20do%20I%20send%20my%20deposit%3F">Not sure where to send the money? Ask Zendropship</SupportLink>
          {state.status === "error" && <FormMessage state={state} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} aria-label={pending ? "Recording…" : undefined}>
              Record deposit
            </Button>
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
        {/* The headline is what is the owner's now; money from undelivered orders is shown apart, as held. */}
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Available balance</p>
        <p className="tabular mt-2 text-3xl font-semibold tracking-[-0.02em] text-ink-950">{formatMoney(summary.availableCents)}</p>
        <dl className="mt-3 space-y-1 text-[0.8125rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-600" title="Deposits and delivered orders, less anything set aside for orders being fulfilled.">
              Available to withdraw
            </dt>
            <dd className="tabular font-medium text-ink-950">{formatMoney(summary.availableCents)}</dd>
          </div>
          {summary.pendingCents !== 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-600" title="What orders not yet delivered will release to you. It becomes available when each order is delivered.">
                Held until delivery
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
        <p className="mt-2 text-[0.8125rem] text-ink-500">What delivered orders left you after the wholesale cost and Zendropship&rsquo;s commission.</p>
      </div>
    </div>
  );
}
