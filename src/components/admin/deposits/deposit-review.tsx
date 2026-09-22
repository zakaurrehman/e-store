"use client";

import { FileText, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { confirmDepositAction, rejectDepositAction } from "@/features/wallet/actions";
import { formatMoney } from "@/utils/money";

export type DepositProof = { url: string; width: number | null; height: number | null; filename: string; mimeType: string } | null;

type ReviewProps = {
  depositId: string;
  amountCents: number;
  storeName: string;
  ownerName: string;
  method: string;
  reference: string | null;
  proof: DepositProof;
};

/** The proof as a thumbnail; clicking it opens the full-size image without leaving the page. */
export function ProofThumbnail({ proof, label = "Deposit proof" }: { proof: DepositProof; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!proof) return <span className="text-[0.8125rem] text-ink-400">No proof uploaded</span>;

  const isImage = proof.mimeType.startsWith("image/");
  if (!isImage) {
    return (
      <a href={proof.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[0.8125rem] text-ink-700 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
        <FileText className="size-4" aria-hidden /> {proof.filename}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block size-16 overflow-hidden rounded-sm border border-line transition-colors hover:border-ink-950"
        aria-label={`${label} — open full size`}
      >
        <Image src={proof.url} alt={label} width={128} height={128} className="size-full object-cover" />
        <span className="absolute inset-0 hidden items-center justify-center bg-ink-950/45 text-white group-hover:flex">
          <ZoomIn className="size-4" aria-hidden />
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label} description={proof.filename} className="sm:w-[min(calc(100vw-2rem),44rem)]">
        <Image
          src={proof.url}
          alt={label}
          width={proof.width ?? 1200}
          height={proof.height ?? 1200}
          className="h-auto w-full rounded-sm border border-line bg-canvas object-contain"
        />
        <p className="mt-3 text-center">
          <a href={proof.url} target="_blank" rel="noopener noreferrer" className="text-[0.875rem] text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
            Open the original
          </a>
        </p>
      </Dialog>
    </>
  );
}

/**
 * Deciding a deposit: the proof beside the figures, and a choice between crediting the owner's wallet
 * or rejecting the claim with a reason. Nothing is credited until the amount here is confirmed.
 */
export function DepositReview({ depositId, amountCents, storeName, ownerName, method, reference, proof }: ReviewProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"review" | "reject">("review");
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const credited = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const validAmount = Number.isInteger(credited) && credited > 0;
  const differs = validAmount && credited !== amountCents;

  const run = (action: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") {
        toast({ title: result.message ?? "That didn't work.", tone: "error" });
        return;
      }
      if (result.message) toast({ title: result.message });
      setOpen(false);
      setMode("review");
      router.refresh();
    });

  const close = () => {
    setOpen(false);
    setMode("review");
    setAmount((amountCents / 100).toFixed(2));
    setReason("");
  };

  return (
    <>
      <Button size="xs" onClick={() => setOpen(true)}>
        Review
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={`${formatMoney(amountCents)} from ${storeName}`}
        description={`Declared by ${ownerName} · ${method}${reference ? ` · ${reference}` : ""}`}
        className="sm:w-[min(calc(100vw-2rem),38rem)]"
        footer={
          mode === "review" ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode("reject")} disabled={pending}>
                Reject
              </Button>
              <Button loading={pending} disabled={!validAmount} onClick={() => run(() => confirmDepositAction(depositId, credited))}>
                Approve &amp; credit {validAmount ? formatMoney(credited) : ""}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode("review")} disabled={pending}>
                Back
              </Button>
              <Button variant="danger" loading={pending} disabled={reason.trim().length < 3} onClick={() => run(() => rejectDepositAction(depositId, reason.trim()))}>
                Reject deposit
              </Button>
            </div>
          )
        }
      >
        {mode === "review" ? (
          <div className="space-y-4">
            {proof ? (
              proof.mimeType.startsWith("image/") ? (
                <a href={proof.url} target="_blank" rel="noopener noreferrer" title="Open the original">
                  <Image
                    src={proof.url}
                    alt="Deposit proof"
                    width={proof.width ?? 900}
                    height={proof.height ?? 900}
                    className="max-h-72 w-full rounded-sm border border-line bg-canvas object-contain"
                  />
                </a>
              ) : (
                <ProofThumbnail proof={proof} />
              )
            ) : (
              <p className="rounded-sm bg-canvas px-3 py-2 text-[0.875rem] text-ink-600">
                No proof was uploaded. Check the transfer against the bank statement or the chain before crediting anything.
              </p>
            )}

            <div>
              <Label htmlFor="deposit-amount">Amount to credit</Label>
              <Input id="deposit-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 w-40" />
              <p className="mt-1.5 text-[0.8125rem] text-ink-500">
                {differs
                  ? `The owner declared ${formatMoney(amountCents)}. Credit what actually arrived.`
                  : "Change this only if a different amount actually arrived."}
              </p>
            </div>

            <p className="border-t border-line pt-3 text-[0.8125rem] leading-relaxed text-ink-600">
              Approving credits the owner&rsquo;s wallet with {validAmount ? formatMoney(credited) : "this amount"} as one ledger entry, records who approved it,
              and releases any order of theirs that was waiting for funds. Nothing is credited before you press it.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[0.875rem] text-ink-600">Nothing is credited. The owner is told, and sees the reason on their balance page.</p>
            <div>
              <Label htmlFor="deposit-reason">Why is it rejected?</Label>
              <Textarea
                id="deposit-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
                placeholder="No transfer with this reference arrived…"
              />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
