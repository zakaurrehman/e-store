"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { addToMyStoreAction } from "@/features/stores/actions";
import { cn } from "@/utils/cn";

/**
 * "Add to my store" on the platform catalogue. Visitors without a store are sent to open one first
 * (the product is remembered and added once their store exists).
 */
export function AddToStoreButton({
  productId,
  productName,
  inStore,
  signedIn,
  size = "sm",
  fullWidth,
  className,
}: {
  productId: string;
  productName: string;
  inStore: boolean;
  signedIn: boolean;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
}) {
  const [added, setAdded] = useState(inStore);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  if (added) {
    return (
      <Link href="/dashboard/products" className={cn(buttonStyles({ variant: "secondary", size, fullWidth }), "gap-1.5", className)}>
        <Check className="size-4" aria-hidden /> In your store
      </Link>
    );
  }

  if (!signedIn) {
    return (
      <Link href={`/start?add=${encodeURIComponent(productId)}`} className={cn(buttonStyles({ variant: "primary", size, fullWidth }), "gap-1.5", className)}>
        <Plus className="size-4" aria-hidden /> Add to my store
      </Link>
    );
  }

  return (
    <Button
      size={size}
      fullWidth={fullWidth}
      loading={pending}
      className={cn("gap-1.5", className)}
      onClick={() =>
        startTransition(async () => {
          const result = await addToMyStoreAction([productId]);
          if (result.ok) {
            setAdded(true);
            toast({ title: result.message, description: productName });
            router.refresh();
          } else if (result.reason === "no-store") {
            router.push(`/start?add=${encodeURIComponent(productId)}`);
          } else if (result.reason === "signin") {
            router.push(`/login?next=${encodeURIComponent(`/catalog`)}`);
          } else {
            toast({ title: result.error, tone: "error" });
          }
        })
      }
    >
      {!pending && <Plus className="size-4" aria-hidden />} Add to my store
    </Button>
  );
}
