"use client";

import { ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { QuantityInput } from "@/components/ui/quantity-input";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";
import { useCart } from "./cart-provider";

export function FreeShippingProgress({ subtotalCents, thresholdCents, className }: { subtotalCents: number; thresholdCents: number | null; className?: string }) {
  if (!thresholdCents) return null;
  const remaining = thresholdCents - subtotalCents;
  const progress = Math.min(100, Math.round((subtotalCents / thresholdCents) * 100));
  return (
    <div className={className}>
      <p className="text-[0.8125rem] text-ink-700">
        {remaining > 0 ? (
          <>
            You’re <span className="tabular font-semibold text-ink-950">{formatMoney(remaining)}</span> away from complimentary standard shipping.
          </>
        ) : (
          <span className="font-medium text-success">You’ve unlocked complimentary standard shipping.</span>
        )}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas-deep" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progress to free shipping">
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", remaining > 0 ? "bg-ink-950" : "bg-success")} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function CartLines({ compact = false }: { compact?: boolean }) {
  const { cart, updateLine, removeLine, pending, closeCart } = useCart();
  return (
    <ul className="divide-y divide-line">
      {cart.lines.map((line) => (
        <li key={line.id} className={cn("flex gap-4", compact ? "py-4" : "py-6")}>
          <Link href={`/p/${line.slug}`} onClick={closeCart} className="relative shrink-0 overflow-hidden rounded-sm bg-canvas">
            {line.imageUrl ? (
              <Image src={line.imageUrl} alt={line.imageAlt} width={compact ? 84 : 112} height={compact ? 105 : 140} sizes={compact ? "84px" : "112px"} className={cn("object-cover", compact ? "h-[105px] w-[84px]" : "h-[140px] w-[112px]")} />
            ) : (
              <div className={cn(compact ? "h-[105px] w-[84px]" : "h-[140px] w-[112px]")} />
            )}
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {line.brandName && <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">{line.brandName}</p>}
                <Link href={`/p/${line.slug}`} onClick={closeCart} className="mt-0.5 block text-[0.9375rem] font-medium leading-snug text-ink-950 hover:underline">
                  {line.name}
                </Link>
                {line.variantTitle && <p className="mt-0.5 text-[0.8125rem] text-ink-500">{line.variantTitle}</p>}
              </div>
              <div className="tabular shrink-0 text-right text-[0.9375rem]">
                <p className={cn("font-medium", line.compareAtCents ? "text-sale" : "text-ink-950")}>{formatMoney(line.lineTotalCents)}</p>
                {line.quantity > 1 && <p className="text-[0.75rem] text-ink-500">{formatMoney(line.unitPriceCents)} each</p>}
              </div>
            </div>
            {!line.available && (
              <p className="mt-2 text-[0.8125rem] font-medium text-danger">
                {line.maxQuantity === 0 ? "Sold out — remove to continue" : `Only ${line.maxQuantity} available — reduce quantity`}
              </p>
            )}
            <div className="mt-auto flex items-center justify-between pt-3">
              <QuantityInput
                size="sm"
                value={line.quantity}
                min={1}
                max={line.maxQuantity ? Math.max(line.maxQuantity, 1) : 20}
                disabled={pending}
                label={`Quantity for ${line.name}`}
                onChange={(quantity) => updateLine(line.id, quantity)}
              />
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-xs px-1 py-1 text-[0.8125rem] text-ink-500 transition-colors hover:text-ink-950 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove<span className="sr-only"> {line.name}</span>
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartDrawer() {
  const { cart, isOpen, closeCart, pending } = useCart();
  const pathname = usePathname();

  useEffect(() => {
    closeCart();
  }, [pathname, closeCart]);

  const merchandise = cart.subtotalCents - cart.discountCents;

  return (
    <Dialog
      open={isOpen}
      onClose={closeCart}
      variant="right"
      title={
        <span>
          Your bag <span className="tabular font-normal text-ink-500">({cart.itemCount})</span>
        </span>
      }
      bodyClassName="px-5 sm:px-6"
      footer={
        cart.lines.length > 0 ? (
          <div className="space-y-3">
            <div className="tabular space-y-1.5 text-[0.9375rem]">
              <div className="flex justify-between">
                <span className="text-ink-600">Subtotal</span>
                <span className="font-medium">{formatMoney(cart.subtotalCents)}</span>
              </div>
              {cart.discountCents > 0 && (
                <div className="flex justify-between text-success">
                  <span>Promo {cart.couponCode}</span>
                  <span>−{formatMoney(cart.discountCents)}</span>
                </div>
              )}
              <p className="text-[0.8125rem] text-ink-500">Shipping and taxes are calculated at checkout.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <ButtonLink href="/cart" variant="secondary" onClick={closeCart}>
                View bag
              </ButtonLink>
              <ButtonLink href="/checkout" onClick={closeCart} aria-disabled={pending || cart.hasUnavailableItems || undefined}>
                Checkout
              </ButtonLink>
            </div>
          </div>
        ) : null
      }
    >
      {cart.lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-6" strokeWidth={1.5} />}
          title="Your bag is empty"
          description="Explore new arrivals and add your favourites — they’ll wait here for you."
          action={
            <ButtonLink href="/collections/new-arrivals" onClick={closeCart}>
              Shop new arrivals
            </ButtonLink>
          }
        />
      ) : (
        <div className={cn("transition-opacity", pending && "opacity-70")}>
          <FreeShippingProgress subtotalCents={merchandise} thresholdCents={cart.freeShippingThresholdCents} className="border-b border-line pb-4" />
          <CartLines compact />
        </div>
      )}
    </Dialog>
  );
}
