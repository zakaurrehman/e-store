"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { adjustStockAction } from "@/features/admin/products/actions";

export function StockEditor({ variantId, current, label }: { variantId: string; current: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(current));
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="tabular rounded-sm border border-transparent px-2 py-1 text-right hover:border-line-strong" aria-label={`Adjust stock for ${label}`}>
        {current}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Adjust stock"
        description={label}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await adjustStockAction(variantId, Number(quantity), note);
                  if (result.status === "error") toast({ title: result.message, tone: "error" });
                  else {
                    toast({ title: "Stock updated" });
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              Save
            </Button>
          </div>
        }
      >
        <Field label="New quantity" htmlFor="stock-qty">
          <Input id="stock-qty" type="number" min={0} value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus />
        </Field>
        <Field label="Reason" htmlFor="stock-note" optional className="mt-4" hint="Recorded in the inventory ledger.">
          <Input id="stock-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Stock count, damaged goods, supplier delivery…" />
        </Field>
      </Dialog>
    </>
  );
}
