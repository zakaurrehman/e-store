"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { creditStoreWalletAction } from "@/features/wallet/actions";
import { idleState } from "@/lib/action-state";
import { formatMoney } from "@/utils/money";

/**
 * Putting money into an owner's balance. It takes the verified amount and a reason, then runs the same
 * two steps as any deposit — recorded, then approved — so the owner sees it in their deposit history and
 * the ledger gains exactly one entry with an audit record behind it.
 */
export function CreditWallet({ storeId, storeName, balanceCents }: { storeId: string; storeName: string; balanceCents: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const valid = Number.isFinite(cents) && cents > 0;
  const after = valid ? balanceCents + cents : null;

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const submit = () =>
    startTransition(async () => {
      const form = new FormData();
      form.set("storeId", storeId);
      form.set("amount", amount);
      form.set("reference", reference);
      form.set("reason", reason);
      const result = await creditStoreWalletAction(idleState, form);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (result.status === "success" && result.message) toast({ title: result.message });
      setOpen(false);
      setAmount("");
      setReference("");
      setReason("");
      setError(null);
      router.refresh();
    });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add money
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={`Add money to ${storeName}`}
        description="For a transfer that arrived without the owner recording it, or money they are owed."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button loading={pending} disabled={!valid || reason.trim().length < 3} onClick={submit}>
              Credit {valid ? formatMoney(cents) : "the wallet"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="credit-amount">Amount that arrived</Label>
            <Input id="credit-amount" inputMode="decimal" placeholder="50.00" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-40" autoFocus />
            <p className="mt-1.5 text-[0.8125rem] text-ink-500">
              {after === null ? "The smallest credit is $5.00." : `Balance goes from ${formatMoney(balanceCents)} to ${formatMoney(after)}.`}
            </p>
          </div>
          <div>
            <Label htmlFor="credit-reference">Bank reference or transaction id (optional)</Label>
            <Input id="credit-reference" maxLength={120} placeholder="TOPUP-…" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="credit-reason">What is this credit for?</Label>
            <Textarea id="credit-reason" rows={2} maxLength={300} placeholder="Bank transfer received on 12 May, reference …" value={reason} onChange={(event) => setReason(event.target.value)} />
            <p className="mt-1.5 text-[0.8125rem] text-ink-500">Kept on the deposit and in the audit log. The owner sees it in their deposit history.</p>
          </div>
          {error && <p className="rounded-sm bg-danger-soft px-3 py-2 text-[0.875rem] text-danger">{error}</p>}
          <p className="border-t border-line pt-3 text-[0.8125rem] leading-relaxed text-ink-600">
            Crediting posts one entry to their ledger, records who did it, and releases any order of theirs that was waiting for funds.
          </p>
        </div>
      </Dialog>
    </>
  );
}
