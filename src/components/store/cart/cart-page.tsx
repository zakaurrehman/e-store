"use client";

import { Lock, ShoppingBag, Tag, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Alert, EmptyState, Skeleton } from "@/components/ui/misc";
import { estimateShippingAction, type ShippingEstimate } from "@/features/cart/actions";
import { COUNTRIES } from "@/lib/countries";
import { formatMoney } from "@/utils/money";
import { CartLines, FreeShippingProgress } from "./cart-drawer";
import { useCart } from "./cart-provider";

function CouponForm() {
  const { cart, applyCoupon, removeCoupon, pending } = useCart();
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);

  if (cart.couponCode && !cart.couponError) {
    return (
      <div className="flex items-center justify-between rounded-sm bg-success-soft px-3 py-2.5 text-sm text-success">
        <span className="inline-flex items-center gap-2 font-medium">
          <Tag className="size-4" aria-hidden /> {cart.couponCode}
          {cart.couponDescription && <span className="font-normal text-ink-600">· {cart.couponDescription}</span>}
        </span>
        <button type="button" onClick={() => removeCoupon()} disabled={pending} className="rounded-xs p-1 text-ink-600 hover:text-ink-950" aria-label={`Remove promo code ${cart.couponCode}`}>
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      {cart.couponError && (
        <Alert tone="warning" className="mb-3">
          {cart.couponCode ? `${cart.couponCode}: ` : ""}
          {cart.couponError}
        </Alert>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
          Add a promo code
        </button>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!code.trim()) return;
            const result = await applyCoupon(code);
            if (result.ok) setCode("");
          }}
        >
          <label htmlFor="coupon-code" className="sr-only">
            Promo code
          </label>
          <input
            id="coupon-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Promo code"
            autoComplete="off"
            maxLength={40}
            className="h-11 min-w-0 flex-1 rounded-sm border border-line-strong px-3.5 text-[0.9375rem] uppercase tracking-[0.04em] outline-none placeholder:normal-case placeholder:tracking-normal focus:border-ink-950"
          />
          <Button type="submit" variant="secondary" loading={pending}>
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}

function ShippingEstimator() {
  const [country, setCountry] = useState("US");
  const [region, setRegion] = useState("");
  const [estimate, setEstimate] = useState<ShippingEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <details className="group border-t border-line pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink-950 [&::-webkit-details-marker]:hidden">
        Estimate shipping & tax
        <span aria-hidden className="text-lg leading-none text-ink-400 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await estimateShippingAction({ country, region: region || undefined });
            if (result.ok) {
              setEstimate(result.estimate);
              setError(null);
            } else {
              setEstimate(null);
              setError(result.error);
            }
          });
        }}
      >
        <div className="grid grid-cols-[1fr_6.5rem] gap-2">
          <div>
            <label htmlFor="estimate-country" className="sr-only">
              Country
            </label>
            <Select id="estimate-country" value={country} onChange={(event) => setCountry(event.target.value)}>
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="estimate-region" className="sr-only">
              State or region code
            </label>
            <input id="estimate-region" value={region} onChange={(event) => setRegion(event.target.value.toUpperCase())} placeholder="State" maxLength={10} className="h-11 w-full rounded-sm border border-line-strong px-3 text-[0.9375rem] outline-none focus:border-ink-950" />
          </div>
        </div>
        <Button type="submit" variant="secondary" size="sm" fullWidth loading={pending}>
          Calculate
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {estimate && (
        <div className="mt-4 space-y-2 text-sm" aria-live="polite">
          <ul className="space-y-1.5">
            {estimate.options.map((option) => (
              <li key={option.id} className="flex justify-between gap-3">
                <span className="text-ink-700">
                  {option.name} <span className="text-ink-400">· {option.estimate}</span>
                </span>
                <span className="tabular font-medium">{option.isFree ? "Free" : formatMoney(option.priceCents)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-line pt-2 text-ink-700">
            <span>Estimated tax{estimate.taxRateLabel ? ` · ${estimate.taxRateLabel}` : ""}</span>
            <span className="tabular font-medium text-ink-950">{formatMoney(estimate.taxCents)}</span>
          </p>
        </div>
      )}
    </details>
  );
}

export function CartPageView() {
  const { cart, ready, pending } = useCart();

  if (!ready) {
    return (
      <div className="grid gap-10 lg:grid-cols-12" aria-busy>
        <div className="space-y-6 lg:col-span-7">
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex gap-4">
              <Skeleton className="h-[140px] w-[112px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-72 lg:col-span-5" />
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="size-6" strokeWidth={1.5} />}
        title="Your bag is empty"
        description="Looks like you haven't added anything yet. Start with our newest pieces."
        action={
          <>
            <ButtonLink href="/collections/new-arrivals">Shop new arrivals</ButtonLink>
            <ButtonLink href="/wishlist" variant="secondary">
              View wishlist
            </ButtonLink>
          </>
        }
      />
    );
  }

  const merchandise = cart.subtotalCents - cart.discountCents;
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
      <section aria-label="Items in your bag" className="lg:col-span-7">
        <FreeShippingProgress subtotalCents={merchandise} thresholdCents={cart.freeShippingThresholdCents} className="rounded-md bg-canvas px-4 py-3.5" />
        {cart.hasUnavailableItems && (
          <Alert tone="warning" className="mt-4">
            Some items are no longer available in the quantity you selected. Update them to continue to checkout.
          </Alert>
        )}
        <div className="mt-2">
          <CartLines />
        </div>
      </section>

      <aside aria-label="Order summary" className="lg:col-span-5">
        <div className="rounded-lg border border-line p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold">Order summary</h2>
          <dl className="tabular mt-5 space-y-3 text-[0.9375rem]">
            <div className="flex justify-between">
              <dt className="text-ink-600">Subtotal ({cart.itemCount} items)</dt>
              <dd className="font-medium">{formatMoney(cart.subtotalCents)}</dd>
            </div>
            {cart.discountCents > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd>−{formatMoney(cart.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-600">Shipping</dt>
              <dd className="text-ink-600">Calculated at checkout</dd>
            </div>
          </dl>
          <div className="mt-5">
            <CouponForm />
          </div>
          <div className="mt-5">
            <ShippingEstimator />
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
            <span className="font-medium">Estimated total</span>
            <span className="tabular text-xl font-semibold">{formatMoney(cart.estimatedTotalCents)}</span>
          </div>
          <ButtonLink href="/checkout" size="lg" fullWidth className="mt-5" aria-disabled={pending || cart.hasUnavailableItems || undefined}>
            <Lock className="size-4" aria-hidden /> Secure checkout
          </ButtonLink>
          <p className="mt-3 text-center text-[0.8125rem] text-ink-500">Taxes and shipping are finalised at checkout.</p>
        </div>
      </aside>
    </div>
  );
}
