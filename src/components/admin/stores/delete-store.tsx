"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { deleteStoreAction, storeDeletionPreviewAction } from "@/features/stores/actions";
import type { StoreDeletionPreview } from "@/features/stores/deletion";

const count = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`;

/**
 * Deleting a store from the admin. Opening it loads what would go, what is kept and anything that stops
 * it; the button stays disabled until the store's address is typed out, and the server checks that too.
 */
export function DeleteStore({ storeId, storeName, size = "xs", afterDelete = "refresh" }: { storeId: string; storeName: string; size?: "xs" | "sm"; afterDelete?: "refresh" | "list" }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<StoreDeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [loading, startLoading] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const show = () => {
    setOpen(true);
    setTyped("");
    setError(null);
    setPreview(null);
    startLoading(async () => {
      const result = await storeDeletionPreviewAction(storeId);
      if (result.ok) setPreview(result.preview);
      else setError(result.message);
    });
  };

  const slug = preview?.store.slug ?? "";
  const confirmed = !!slug && typed.trim().toLowerCase() === slug;
  const remove = () =>
    startDeleting(async () => {
      const result = await deleteStoreAction(storeId, typed);
      if (result.status === "error") {
        toast({ title: result.message, tone: "error" });
        return;
      }
      if (result.status === "success" && result.message) toast({ title: result.message });
      setOpen(false);
      if (afterDelete === "list") router.push("/admin/stores");
      router.refresh();
    });

  const blocked = !!preview && preview.blockers.length > 0;
  return (
    <>
      <Button size={size} variant="ghost" className="text-danger hover:bg-danger-soft" onClick={show}>
        Delete
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${storeName} permanently?`}
        description="This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleting}>
              {blocked ? "Back" : "Cancel"}
            </Button>
            {!blocked && (
              <Button variant="danger" loading={deleting} disabled={!confirmed} onClick={remove}>
                Delete store permanently
              </Button>
            )}
          </div>
        }
      >
        {loading && !preview && (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-24" />
          </div>
        )}
        {error && <p className="text-[0.9375rem] text-danger">{error}</p>}
        {preview && (
          <div className="space-y-4 text-[0.875rem] leading-relaxed text-ink-700">
            {blocked ? (
              <div className="rounded-sm border border-danger/40 bg-danger-soft p-3" role="alert">
                <p className="flex items-center gap-2 font-medium text-danger">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden /> This store can&rsquo;t be deleted yet
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-800">
                  {preview.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
                <p className="mt-2 text-ink-600">Until then you can suspend it, which hides it from shoppers straight away.</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-medium text-ink-950">Removed for good</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    <li>
                      The store and its address, <span className="font-mono text-[0.8125rem]">{preview.store.slug}</span> — the storefront stops working at once.
                    </li>
                    <li>{preview.store.ownerEmail ? `Access for its owner, ${preview.store.ownerEmail}` : "Its owner's access"} — they would need a new invitation to open another store.</li>
                    <li>
                      {count(preview.removes.products, "product")} on its shelf, {count(preview.removes.carts, "shopping bag")}, {count(preview.removes.coupons, "coupon")} and{" "}
                      {count(preview.removes.conversations, "customer conversation")}.
                    </li>
                    {preview.removes.unpaidOrders > 0 && <li>{count(preview.removes.unpaidOrders, "unpaid order")} cancelled, with the stock returned.</li>}
                    {preview.removes.signups > 0 && <li>{count(preview.removes.signups, "customer account")} signed up here stay open, no longer tied to the store.</li>}
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-ink-950">Kept for the records</p>
                  <p className="mt-1">
                    {count(preview.keeps.orders, "order")}, {count(preview.keeps.ledgerEntries, "wallet ledger entry", "wallet ledger entries")}, {count(preview.keeps.deposits, "deposit")} and{" "}
                    {count(preview.keeps.payouts, "withdrawal")} stay in Orders, Deposits and Withdrawals, read-only. They record real payments, so they are never erased.
                  </p>
                </div>
                <div>
                  <Label htmlFor={`delete-store-${storeId}`}>
                    Type <span className="font-mono">{preview.store.slug}</span> to confirm
                  </Label>
                  <Input
                    id={`delete-store-${storeId}`}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-1.5 font-mono"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
