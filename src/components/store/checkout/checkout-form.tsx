"use client";

import { Check, ChevronDown, Lock, Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Radio, TextField, Textarea } from "@/components/ui/field";
import { Alert, Skeleton } from "@/components/ui/misc";
import { getCheckoutQuoteAction, placeOrderAction, type CheckoutQuote } from "@/features/checkout/actions";
import type { CartSnapshot } from "@/features/cart/types";
import type { AddressSnapshot } from "@/lib/address";
import { formatAddressLines } from "@/lib/address";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";
import { AddressFields, EMPTY_ADDRESS, addressFormToInput, type AddressFormValue } from "./address-fields";

export type SavedAddress = AddressSnapshot & { id: string; label: string | null; isDefaultShipping: boolean };

type Props = {
  cart: CartSnapshot;
  customer: { id: string; email: string; firstName: string; lastName: string; phone: string | null } | null;
  savedAddresses: SavedAddress[];
  shippableCountries: string[] | "*";
  guestCheckoutEnabled: boolean;
};

type Step = "contact" | "address" | "delivery" | "payment" | "review";
const STEP_TITLES: Record<Step, string> = { contact: "Contact", address: "Shipping address", delivery: "Delivery", payment: "Payment", review: "Review & place order" };

function idempotencyKeyFor(cartId: string | null) {
  const storageKey = `zendropship:checkout-key:${cartId ?? "anon"}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function Section({ step, title, active, done, summary, onEdit, children, index }: { step: Step; title: string; active: boolean; done: boolean; summary?: ReactNode; onEdit: () => void; children: ReactNode; index: number }) {
  return (
    <section aria-labelledby={`step-${step}`} className={cn("border-b border-line py-6", !active && !done && "opacity-50")}>
      <div className="flex items-center justify-between gap-4">
        <h2 id={`step-${step}`} className="flex items-center gap-3 text-lg font-semibold tracking-[-0.01em]">
          <span className={cn("flex size-7 items-center justify-center rounded-full text-[0.8125rem]", done ? "bg-ink-950 text-white" : active ? "border border-ink-950 text-ink-950" : "border border-line-strong text-ink-400")}>
            {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
          </span>
          {title}
        </h2>
        {done && !active && (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-sm text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
            <Pencil className="size-3.5" aria-hidden /> Edit
          </button>
        )}
      </div>
      {active ? <div className="mt-5">{children}</div> : done && summary ? <div className="mt-3 pl-10 text-[0.9375rem] text-ink-600">{summary}</div> : null}
    </section>
  );
}

export function CheckoutForm({ cart, customer, savedAddresses, shippableCountries, guestCheckoutEnabled }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(customer ? "address" : "contact");
  const [completed, setCompleted] = useState<Set<Step>>(new Set(customer ? ["contact"] : []));
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const defaultSaved = savedAddresses.find((address) => address.isDefaultShipping) ?? savedAddresses[0] ?? null;
  const [savedId, setSavedId] = useState<string | null>(defaultSaved?.id ?? null);
  const [useNewAddress, setUseNewAddress] = useState(savedAddresses.length === 0);
  const [address, setAddress] = useState<AddressFormValue>(() => (customer ? { ...EMPTY_ADDRESS, firstName: customer.firstName, lastName: customer.lastName } : EMPTY_ADDRESS));
  const [saveAddress, setSaveAddress] = useState(!!customer);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressFormValue>(EMPTY_ADDRESS);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [quoting, startQuote] = useTransition();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const idempotencyKey = useRef<string>("");
  const quoteVersion = useRef(0);

  useEffect(() => {
    idempotencyKey.current = idempotencyKeyFor(cart.id);
  }, [cart.id]);

  const shippingAddress: AddressSnapshot | null = useMemo(() => {
    if (!useNewAddress && savedId) {
      const saved = savedAddresses.find((entry) => entry.id === savedId);
      return saved ? { ...saved } : null;
    }
    return address.line1 ? addressFormToInput(address) as AddressSnapshot : null;
  }, [useNewAddress, savedId, savedAddresses, address]);

  const loadQuote = useCallback(
    (country: string, region: string | null | undefined, methodId: string | null) => {
      const version = ++quoteVersion.current;
      startQuote(async () => {
        const result = await getCheckoutQuoteAction({ country, region: region ?? undefined, shippingMethodId: methodId ?? undefined });
        if (version !== quoteVersion.current) return;
        if (!result.ok) {
          setQuote(null);
          setQuoteError(result.error);
          return;
        }
        setQuote(result.quote);
        setQuoteError(result.quote.canShip ? null : "We don't ship to this destination yet. Please choose another address.");
        setShippingMethodId(result.quote.selectedShippingId);
        setPaymentProvider((current) => (current && result.quote.paymentMethods.some((method) => method.key === current) ? current : (result.quote.paymentMethods[0]?.key ?? null)));
      });
    },
    [],
  );

  const complete = (current: Step, next: Step) => {
    setCompleted((prev) => new Set(prev).add(current));
    setStep(next);
    setErrors({});
    setFormError(null);
  };

  const validateEmail = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setErrors({ email: ["Enter a valid email address."] });
      return false;
    }
    return true;
  };

  const validateAddress = () => {
    if (!useNewAddress && savedId) return true;
    const problems: Record<string, string[]> = {};
    if (!address.firstName.trim()) problems["shippingAddress.firstName"] = ["Enter a first name."];
    if (!address.lastName.trim()) problems["shippingAddress.lastName"] = ["Enter a last name."];
    if (!address.line1.trim()) problems["shippingAddress.line1"] = ["Enter a street address."];
    if (!address.city.trim()) problems["shippingAddress.city"] = ["Enter a city."];
    if (!address.postalCode.trim()) problems["shippingAddress.postalCode"] = ["Enter a postal code."];
    if (["US", "CA", "AU"].includes(address.country) && !address.region.trim()) problems["shippingAddress.region"] = ["Enter a state or province."];
    setErrors(problems);
    return Object.keys(problems).length === 0;
  };

  const submitAddress = () => {
    if (!validateAddress() || !shippingAddress) return;
    loadQuote(shippingAddress.country, shippingAddress.region, shippingMethodId);
    complete("address", "delivery");
  };

  const placeOrder = async () => {
    if (!shippingAddress || !shippingMethodId || !paymentProvider) return;
    setPlacing(true);
    setFormError(null);
    const payload = {
      idempotencyKey: idempotencyKey.current,
      email: email.trim(),
      phone: phone || undefined,
      shippingAddressId: !useNewAddress && savedId ? savedId : undefined,
      shippingAddress: useNewAddress || !savedId ? addressFormToInput(address) : undefined,
      billingSameAsShipping: billingSame,
      billingAddress: billingSame ? undefined : addressFormToInput(billing),
      shippingMethodId,
      paymentProvider,
      customerNote: customerNote || undefined,
      saveAddress,
      marketingOptIn,
    };
    const result = await placeOrderAction(payload);
    if (!result.ok) {
      setPlacing(false);
      setFormError(result.error);
      setErrors(result.fieldErrors ?? {});
      if (result.code === "CART_EMPTY" || result.code === "CART_UNAVAILABLE" || result.code === "OUT_OF_STOCK") {
        router.push("/cart");
        router.refresh();
      } else if (result.fieldErrors && Object.keys(result.fieldErrors).some((key) => key.startsWith("shippingAddress"))) {
        setStep("address");
      } else if (result.fieldErrors?.shippingMethodId) setStep("delivery");
      else if (result.fieldErrors?.paymentProvider) setStep("payment");
      return;
    }
    try {
      sessionStorage.removeItem(`zendropship:checkout-key:${cart.id ?? "anon"}`);
    } catch {}
    window.location.assign(result.redirectUrl);
  };

  const merchandise = cart.subtotalCents - cart.discountCents;
  const totals = quote?.totals ?? { subtotalCents: cart.subtotalCents, discountCents: cart.discountCents, shippingCents: 0, taxCents: 0, totalCents: merchandise };
  const selectedMethod = quote?.shippingOptions.find((option) => option.id === shippingMethodId);
  const selectedPayment = quote?.paymentMethods.find((method) => method.key === paymentProvider);

  const summary = (
    <div>
      <ul className="divide-y divide-line">
        {cart.lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3.5 py-3.5">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-canvas">
              {line.imageUrl && <Image src={line.imageUrl} alt="" fill sizes="64px" className="object-cover" />}
              <span className="tabular absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-700 px-1 text-[0.6875rem] font-semibold text-white">{line.quantity}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-950">{line.name}</p>
              {line.variantTitle && <p className="text-[0.8125rem] text-ink-500">{line.variantTitle}</p>}
            </div>
            <p className="tabular text-sm">{formatMoney(line.lineTotalCents)}</p>
          </li>
        ))}
      </ul>
      <dl className="tabular mt-4 space-y-2 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-600">Subtotal</dt>
          <dd>{formatMoney(totals.subtotalCents)}</dd>
        </div>
        {totals.discountCents > 0 && (
          <div className="flex justify-between text-success">
            <dt>Discount{cart.couponCode ? ` (${cart.couponCode})` : ""}</dt>
            <dd>−{formatMoney(totals.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-ink-600">Shipping</dt>
          <dd className={cn(!quote && "text-ink-400")}>{quote ? (totals.shippingCents === 0 ? "Free" : formatMoney(totals.shippingCents)) : "Calculated next"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-600">Tax{quote?.taxLabel ? <span className="text-ink-400"> · {quote.taxLabel}</span> : null}</dt>
          <dd className={cn(!quote && "text-ink-400")}>{quote ? formatMoney(totals.taxCents) : "—"}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(totals.totalCents)}</dd>
        </div>
      </dl>
      <Link href="/cart" className="mt-4 inline-block text-[0.8125rem] text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
        Edit bag or promo code
      </Link>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-16">
      <div className="lg:col-span-7">
        {/* Mobile summary toggle */}
        <button type="button" onClick={() => setSummaryOpen((value) => !value)} className="flex w-full items-center justify-between rounded-md bg-canvas px-4 py-3 text-sm lg:hidden" aria-expanded={summaryOpen}>
          <span className="inline-flex items-center gap-2 font-medium">
            {summaryOpen ? "Hide" : "Show"} order summary <ChevronDown className={cn("size-4 transition-transform", summaryOpen && "rotate-180")} />
          </span>
          <span className="tabular font-semibold">{formatMoney(totals.totalCents)}</span>
        </button>
        {summaryOpen && <div className="rounded-b-md border border-t-0 border-line px-4 pb-4 lg:hidden">{summary}</div>}

        {formError && (
          <Alert tone="danger" className="mt-6">
            {formError}
          </Alert>
        )}

        <Section step="contact" index={0} title={STEP_TITLES.contact} active={step === "contact"} done={completed.has("contact")} onEdit={() => setStep("contact")} summary={<>{email}{phone ? ` · ${phone}` : ""}</>}>
          {!customer && (
            <p className="mb-4 text-[0.9375rem] text-ink-600">
              Have an account?{" "}
              <Link href="/login?next=/checkout" className="font-medium text-ink-950 underline underline-offset-4">
                Sign in
              </Link>{" "}
              for saved addresses and faster checkout{guestCheckoutEnabled ? ", or continue as a guest." : "."}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="email" type="email" label="Email address" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email} readOnly={!!customer} wrapperClassName={customer ? "sm:col-span-2" : ""} />
            {!customer && (
              <Field label="Phone" htmlFor="contact-phone" optional hint="For delivery updates only.">
                <Input id="contact-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </Field>
            )}
          </div>
          {!customer && <Checkbox id="checkout-marketing" className="mt-4" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} label="Email me about new arrivals and offers" />}
          <Button className="mt-6" onClick={() => validateEmail() && complete("contact", "address")}>
            Continue to shipping
          </Button>
        </Section>

        <Section step="address" index={1} title={STEP_TITLES.address} active={step === "address"} done={completed.has("address")} onEdit={() => setStep("address")} summary={shippingAddress && <>{formatAddressLines(shippingAddress).slice(0, 4).join(", ")}</>}>
          {savedAddresses.length > 0 && (
            <fieldset className="mb-5">
              <legend className="sr-only">Saved addresses</legend>
              <div className="space-y-2">
                {savedAddresses.map((saved) => (
                  <label key={saved.id} className={cn("flex cursor-pointer gap-3 rounded-md border p-4 transition-colors", !useNewAddress && savedId === saved.id ? "border-ink-950" : "border-line hover:border-line-strong")}>
                    <Radio name="savedAddress" checked={!useNewAddress && savedId === saved.id} onChange={() => { setSavedId(saved.id); setUseNewAddress(false); }} className="mt-0.5" />
                    <span className="text-[0.9375rem] leading-relaxed text-ink-800">
                      {saved.label && <span className="mr-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">{saved.label}</span>}
                      {formatAddressLines(saved).join(", ")}
                    </span>
                  </label>
                ))}
                <label className={cn("flex cursor-pointer gap-3 rounded-md border p-4", useNewAddress ? "border-ink-950" : "border-line hover:border-line-strong")}>
                  <Radio name="savedAddress" checked={useNewAddress} onChange={() => setUseNewAddress(true)} className="mt-0.5" />
                  <span className="text-[0.9375rem] text-ink-800">Use a new address</span>
                </label>
              </div>
            </fieldset>
          )}
          {(useNewAddress || savedAddresses.length === 0) && (
            <>
              <AddressFields value={address} onChange={setAddress} errors={errors} prefix="shippingAddress." idPrefix="ship" allowedCountries={shippableCountries} showPhone={!!customer} />
              {customer && <Checkbox id="save-address" className="mt-4" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} label="Save this address to my account" />}
            </>
          )}
          <Button className="mt-6" onClick={submitAddress}>
            Continue to delivery
          </Button>
        </Section>

        <Section step="delivery" index={2} title={STEP_TITLES.delivery} active={step === "delivery"} done={completed.has("delivery")} onEdit={() => setStep("delivery")} summary={selectedMethod && <>{selectedMethod.name} · {selectedMethod.estimate} · {selectedMethod.isFree ? "Free" : formatMoney(selectedMethod.priceCents)}</>}>
          {quoting && !quote ? (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : quoteError ? (
            <Alert tone="warning">{quoteError}</Alert>
          ) : quote ? (
            <fieldset>
              <legend className="sr-only">Delivery method</legend>
              <div className="space-y-2">
                {quote.shippingOptions.map((option) => (
                  <label key={option.id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors", shippingMethodId === option.id ? "border-ink-950" : "border-line hover:border-line-strong")}>
                    <Radio name="shippingMethod" checked={shippingMethodId === option.id} onChange={() => { setShippingMethodId(option.id); if (shippingAddress) loadQuote(shippingAddress.country, shippingAddress.region, option.id); }} className="mt-0.5" />
                    <span className="flex-1">
                      <span className="flex justify-between gap-3 text-[0.9375rem] font-medium text-ink-950">
                        {option.name}
                        <span className="tabular">{option.isFree ? "Free" : formatMoney(option.priceCents)}</span>
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-ink-500">
                        {option.estimate}
                        {option.description ? ` · ${option.description}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.shippingMethodId && <p className="mt-2 text-sm text-danger">{errors.shippingMethodId[0]}</p>}
            </fieldset>
          ) : null}
          <Button className="mt-6" disabled={!shippingMethodId || !!quoteError || quoting} onClick={() => complete("delivery", "payment")}>
            Continue to payment
          </Button>
        </Section>

        <Section step="payment" index={3} title={STEP_TITLES.payment} active={step === "payment"} done={completed.has("payment")} onEdit={() => setStep("payment")} summary={selectedPayment && <>{selectedPayment.label}</>}>
          {quote && (
            <fieldset>
              <legend className="sr-only">Payment method</legend>
              <div className="space-y-2">
                {quote.paymentMethods.map((method) => (
                  <label key={method.key} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors", paymentProvider === method.key ? "border-ink-950" : "border-line hover:border-line-strong")}>
                    <Radio name="paymentProvider" checked={paymentProvider === method.key} onChange={() => setPaymentProvider(method.key)} className="mt-0.5" />
                    <span>
                      <span className="block text-[0.9375rem] font-medium text-ink-950">{method.label}</span>
                      <span className="mt-0.5 block text-[0.8125rem] text-ink-500">{method.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {quote.paymentMethods.length === 0 && <Alert tone="warning">No payment methods are available for this destination.</Alert>}
              {errors.paymentProvider && <p className="mt-2 text-sm text-danger">{errors.paymentProvider[0]}</p>}
            </fieldset>
          )}
          <div className="mt-5">
            <Checkbox id="billing-same" checked={billingSame} onChange={(event) => setBillingSame(event.target.checked)} label="Billing address is the same as shipping" />
            {!billingSame && (
              <div className="mt-4">
                <AddressFields value={billing} onChange={setBilling} errors={errors} prefix="billingAddress." idPrefix="bill" showPhone={false} />
              </div>
            )}
          </div>
          <p className="mt-5 flex items-center gap-2 text-[0.8125rem] text-ink-500">
            <Lock className="size-3.5" aria-hidden /> Payment details are entered on the provider’s secure page. Your order is confirmed only once payment is verified.
          </p>
          <Button className="mt-6" disabled={!paymentProvider} onClick={() => complete("payment", "review")}>
            Review order
          </Button>
        </Section>

        <Section step="review" index={4} title={STEP_TITLES.review} active={step === "review"} done={false} onEdit={() => setStep("review")}>
          <Field label="Order note" htmlFor="customer-note" optional hint="Delivery instructions or a gift message.">
            <Textarea id="customer-note" rows={3} maxLength={500} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} />
          </Field>
          <div className="mt-6 rounded-md bg-canvas p-4 text-[0.9375rem] text-ink-700">
            <p>
              You’ll pay <span className="tabular font-semibold text-ink-950">{formatMoney(totals.totalCents)}</span> with {selectedPayment?.label ?? "your selected method"}.
              {selectedPayment?.flow === "redirect" ? " You’ll be taken to a secure payment page next." : " Your order will be confirmed right away."}
            </p>
          </div>
          <p className="mt-4 text-[0.8125rem] text-ink-500">
            By placing your order you agree to our{" "}
            <Link href="/pages/terms" className="underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/pages/privacy" className="underline underline-offset-2">
              Privacy policy
            </Link>
            .
          </p>
          <Button size="lg" fullWidth className="mt-6" loading={placing} onClick={placeOrder} disabled={!quote || quoting}>
            {selectedPayment?.flow === "redirect" ? "Continue to payment" : "Place order"}
          </Button>
        </Section>
      </div>

      <aside className="hidden lg:col-span-5 lg:block" aria-label="Order summary">
        <div className="sticky top-24 rounded-lg border border-line p-6">
          <h2 className="text-lg font-semibold">
            Order summary <span className="tabular font-normal text-ink-500">({cart.itemCount})</span>
          </h2>
          <div className="mt-2">{summary}</div>
        </div>
      </aside>
    </div>
  );
}
