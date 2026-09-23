"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { markPayoutPaidAction } from "@/features/wallet/actions";
import { looksLikeTrc20TxId, TRC20_LABEL } from "@/lib/tron";
import { formatMoney } from "@/utils/money";

/**
 * Marking a withdrawal paid, once the money has actually been sent. For USDT (TRC20) it shows the owner's
 * address to copy into Binance and keeps the transaction id as the payout's reference, so the owner — and
 * anyone checking later — can find the transfer on the chain.
 */
export function MarkPaid({ payoutId, amountCents, method, destination }: { payoutId: string; amountCents: number; method: string; destination: string }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const trc20 = method === "USDT_TRC20";
  const valid = !trc20 || reference.trim() === "" || looksLikeTrc20TxId(reference);

  const submit = () =>
    startTransition(async () => {
      const result = await markPayoutPaidAction(payoutId, reference.trim() || undefined);
      if (result.status === "error") {
        toast({ title: result.message, tone: "error" });
        return;
      }
      if (result.status === "success" && result.message) toast({ title: result.message });
      setOpen(false);
      setReference("");
      router.refresh();
    });

  return (
    <>
      <Button size="xs" onClick={() => setOpen(true)}>
        Mark paid
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Mark ${formatMoney(amountCents)} as paid?`}
        description="Only once the money has actually been sent."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button loading={pending} disabled={!valid} onClick={submit}>
              Mark as paid
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {trc20 && (
            <div className="rounded-sm border border-line p-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">Send {TRC20_LABEL} to</p>
              <div className="mt-1.5">
                <CopyValue value={destination} label="owner's TRC20 address" />
              </div>
              <p className="mt-2 text-[0.75rem] text-ink-500">Choose the TRON (TRC20) network in Binance. The address was checked when the owner asked.</p>
            </div>
          )}
          <div>
            <Label htmlFor={`payout-reference-${payoutId}`}>{trc20 ? "Transaction id (TxID)" : "Reference"} (optional)</Label>
            <Input
              id={`payout-reference-${payoutId}`}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              className={trc20 ? "font-mono text-[0.8125rem]" : undefined}
            />
            {!valid && <p className="mt-1.5 text-[0.75rem] text-warning">A transaction id is 64 letters and numbers.</p>}
            <p className="mt-1.5 text-[0.75rem] text-ink-500">The owner sees it on their withdrawal, so they can find the transfer.</p>
          </div>
        </div>
      </Dialog>
    </>
  );
}
