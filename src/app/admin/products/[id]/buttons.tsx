"use client";

import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deleteProductAction, duplicateProductAction } from "@/features/admin/products/actions";

export function DuplicateProductButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await duplicateProductAction(productId);
          if (result.status === "error") toast({ title: result.message, tone: "error" });
          else if (result.status === "success" && result.data) {
            toast({ title: result.message ?? "Duplicated" });
            router.push(`/admin/products/${result.data.id}`);
          }
        })
      }
    >
      <Copy className="size-4" /> Duplicate
    </Button>
  );
}

export function DeleteProductButton({ productId, name, autoOpen }: { productId: string; name: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete “${name}”?`}
        description="Products with order history are archived instead of deleted so past orders keep their records."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteProductAction(productId);
                  if (result.status === "error") toast({ title: result.message, tone: "error" });
                  else {
                    toast({ title: (result.status === "success" && result.message) || "Deleted" });
                    router.push("/admin/products");
                  }
                })
              }
            >
              Delete product
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">This removes the product from the store immediately.</p>
      </Dialog>
    </>
  );
}
