"use client";

import { Check, Copy, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Label, Textarea, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  removeFromMyStoreAction,
  removeStoreImageAction,
  saveStorePricingAction,
  saveStoreProductPricingAction,
  saveStoreSettingsAction,
  setStoreProductVisibilityAction,
  uploadStoreImageAction,
} from "@/features/stores/actions";
import { storePriceFor } from "@/features/stores/pricing";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

/** Toasts and refreshes after a successful form action. */
function useActionFeedback(state: ActionState) {
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.message) toast({ title: state.message });
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function CopyLink({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(url).catch(() => undefined);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

// ─── Products ────────────────────────────────────────────────────────────────

export function VisibilityToggle({ productId, isActive, disabled }: { productId: string; isActive: boolean; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(isActive);
  const toast = useToast();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={value ? "Shown in store — click to hide" : "Hidden — click to show in store"}
      disabled={pending || disabled}
      onClick={() =>
        startTransition(async () => {
          const next = !value;
          setValue(next);
          const result = await setStoreProductVisibilityAction(productId, next);
          if (result.status === "error") {
            setValue(!next);
            toast({ title: result.message, tone: "error" });
          }
        })
      }
      className={cn("relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", value ? "bg-success" : "bg-line-strong")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", value ? "translate-x-[1.125rem]" : "translate-x-0.5")} />
    </button>
  );
}

export function RemoveProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label={`Remove ${productName} from your store`}>
        <Trash2 className="size-4" />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Remove from your store?"
        description={productName}
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
                  const result = await removeFromMyStoreAction(productId);
                  if (result.status === "error") toast({ title: result.message, tone: "error" });
                  else {
                    toast({ title: "Removed from your store" });
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">It disappears from your store straight away. Past orders are not affected, and you can add it again from the catalogue.</p>
      </Dialog>
    </>
  );
}

/** Per-product price: follow the store rule, use a custom markup, or a fixed price. */
export function ProductPriceEditor({
  row,
  storeRule,
}: {
  row: { productId: string; name: string; costCents: number; suggestedCents: number; priceCents: number; markupBps: number | null; fixedPriceCents: number | null; hasVariants: boolean };
  storeRule: { mode: "SUGGESTED" | "MARKUP"; markupBps: number };
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(saveStoreProductPricingAction, idleState);
  const initialMode = row.fixedPriceCents !== null ? "fixed" : row.markupBps !== null ? "markup" : "store";
  const [mode, setMode] = useState<"store" | "markup" | "fixed">(initialMode);
  const [markup, setMarkup] = useState(row.markupBps !== null ? String(row.markupBps / 100) : String(storeRule.markupBps / 100));
  const [fixed, setFixed] = useState(row.fixedPriceCents !== null ? (row.fixedPriceCents / 100).toFixed(2) : (row.priceCents / 100).toFixed(2));
  useActionFeedback(state);
  // Close after a successful save — adjusted during render rather than in an effect.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") setOpen(false);
  }

  const cost = { priceCents: row.suggestedCents, salePriceCents: null, costCents: row.costCents };
  const preview =
    mode === "fixed"
      ? Math.round(Number(fixed || 0) * 100)
      : mode === "markup"
        ? storePriceFor(cost, storeRule, { markupBps: Math.round(Number(markup || 0) * 100), fixedPriceCents: null }).priceCents
        : storePriceFor(cost, storeRule).priceCents;
  const margin = preview - row.costCents;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-left text-[0.8125rem] text-iris-600 hover:underline">
        {initialMode === "store" ? "Store rule" : initialMode === "markup" ? `${(row.markupBps ?? 0) / 100}% markup` : "Fixed price"} · Edit
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Set the price" description={row.name}>
        <form action={action} className="space-y-5">
          <input type="hidden" name="productId" value={row.productId} />
          <fieldset className="space-y-2">
            <legend className="sr-only">Pricing</legend>
            {(
              [
                ["store", storeRule.mode === "MARKUP" ? `Use the store rule (${storeRule.markupBps / 100}% markup)` : "Use the store rule (suggested price)"],
                ["markup", "Custom markup for this product"],
                ["fixed", row.hasVariants ? "Fixed price for every option" : "Fixed price"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-sm border border-line px-3 py-2.5 text-[0.9375rem] has-[:checked]:border-ink-950">
                <input type="radio" name="pricingChoice" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-ink-950" />
                {label}
              </label>
            ))}
          </fieldset>
          {mode === "markup" && (
            <TextField name="markupPercent" label="Markup over what you pay (%)" type="number" min={0} max={1000} step="1" value={markup} onChange={(event) => setMarkup(event.target.value)} error={fieldError(state, "markupPercent")} />
          )}
          {mode === "fixed" && (
            <TextField name="fixedPrice" label="Selling price (USD)" type="number" min={0.01} step="0.01" value={fixed} onChange={(event) => setFixed(event.target.value)} error={fieldError(state, "fixedPrice")} />
          )}
          <dl className="tabular grid grid-cols-3 gap-2 rounded-sm bg-canvas p-3 text-sm">
            <div>
              <dt className="text-ink-500">You pay</dt>
              <dd className="font-medium">{formatMoney(row.costCents)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Sells for</dt>
              <dd className="font-medium">{formatMoney(preview)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">You earn</dt>
              <dd className={cn("font-medium", margin > 0 ? "text-success" : "text-danger")}>{formatMoney(margin)}</dd>
            </div>
          </dl>
          {margin <= 0 && <p className="text-[0.8125rem] text-danger">At this price you would not make money on this product.</p>}
          {state.status === "error" && <FormMessage state={state} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Save price</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

type SettingsValues = {
  name: string;
  tagline: string | null;
  aboutText: string | null;
  supportEmail: string | null;
  announcement: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  accentColor: string;
};

const SWATCHES = ["#5446ff", "#0b0c0e", "#1f7a4d", "#c2410c", "#be185d", "#0369a1", "#7c3aed", "#b45309"];

export function StoreSettingsForm({ values }: { values: SettingsValues }) {
  const [state, action] = useActionState<ActionState, FormData>(saveStoreSettingsAction, idleState);
  const [accent, setAccent] = useState(values.accentColor);
  useActionFeedback(state);
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <TextField name="name" label="Store name" defaultValue={values.name} required maxLength={60} error={fieldError(state, "name")} />
        <TextField name="tagline" label="Tagline" defaultValue={values.tagline ?? ""} maxLength={120} optional placeholder="Everyday pieces, beautifully made" error={fieldError(state, "tagline")} />
        <TextField name="supportEmail" type="email" label="Customer support email" defaultValue={values.supportEmail ?? ""} optional hint="Shown on your contact page and in customer emails." error={fieldError(state, "supportEmail")} />
        <TextField name="announcement" label="Announcement bar" defaultValue={values.announcement ?? ""} maxLength={160} optional placeholder="Free delivery on orders over $75" error={fieldError(state, "announcement")} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField name="heroTitle" label="Homepage headline" defaultValue={values.heroTitle ?? ""} maxLength={80} optional error={fieldError(state, "heroTitle")} />
        <TextField name="heroSubtitle" label="Homepage subheading" defaultValue={values.heroSubtitle ?? ""} maxLength={200} optional error={fieldError(state, "heroSubtitle")} />
      </div>
      <Field label="About your store" htmlFor="about-text" optional error={fieldError(state, "aboutText")}>
        <Textarea id="about-text" name="aboutText" defaultValue={values.aboutText ?? ""} rows={4} maxLength={2000} />
      </Field>
      <div>
        <Label htmlFor="accent-color">Accent colour</Label>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setAccent(swatch)}
              className={cn("size-8 rounded-full border-2 transition-transform", accent.toLowerCase() === swatch ? "scale-110 border-ink-950" : "border-transparent")}
              style={{ backgroundColor: swatch }}
              aria-label={`Use ${swatch}`}
              aria-pressed={accent.toLowerCase() === swatch}
            />
          ))}
          <Input id="accent-color" name="accentColor" value={accent} onChange={(event) => setAccent(event.target.value)} className="ml-2 w-28 font-mono" maxLength={7} />
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#5446ff"} onChange={(event) => setAccent(event.target.value)} className="size-9 cursor-pointer rounded-sm border border-line" aria-label="Pick a custom colour" />
        </div>
        <p className="mt-1.5 text-[0.8125rem] text-ink-500">Used for links, focus rings and highlights across your store.</p>
        {fieldError(state, "accentColor") && <p className="mt-1.5 text-[0.8125rem] text-danger">{fieldError(state, "accentColor")}</p>}
      </div>
      {state.status === "error" && <FormMessage state={state} />}
      <div className="flex justify-end">
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}

export function StoreImageUpload({ kind, label, hint, current }: { kind: "logo" | "hero"; label: string; hint: string; current: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(uploadStoreImageAction, idleState);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const router = useRouter();
  useActionFeedback(state);
  return (
    <div className="flex items-start gap-4">
      <div className={cn("relative shrink-0 overflow-hidden rounded-md border border-line bg-canvas", kind === "logo" ? "h-16 w-32" : "h-20 w-36")}>
        {current ? <Image src={current} alt="" fill sizes="144px" className={kind === "logo" ? "object-contain p-2" : "object-cover"} /> : <span className="flex h-full items-center justify-center text-[0.75rem] text-ink-400">None</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-950">{label}</p>
        <p className="text-[0.8125rem] text-ink-500">{hint}</p>
        <form ref={formRef} action={action} className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input ref={inputRef} type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="sr-only" onChange={() => formRef.current?.requestSubmit()} />
          <SubmitButton variant="secondary" size="xs" type="button" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="size-3.5" aria-hidden /> {current ? "Replace" : "Upload"}
          </SubmitButton>
          {current && (
            <Button
              variant="ghost"
              size="xs"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeStoreImageAction(kind);
                  if (result.status === "error") toast({ title: result.message, tone: "error" });
                  else {
                    toast({ title: result.status === "success" && result.message ? result.message : "Removed" });
                    router.refresh();
                  }
                })
              }
            >
              Remove
            </Button>
          )}
        </form>
        {state.status === "error" && <p className="mt-2 text-[0.8125rem] text-danger">{state.message}</p>}
      </div>
    </div>
  );
}

export function StorePricingForm({ mode, markupBps, example }: { mode: "SUGGESTED" | "MARKUP"; markupBps: number; example: { name: string; costCents: number; suggestedCents: number } | null }) {
  const [state, action] = useActionState<ActionState, FormData>(saveStorePricingAction, idleState);
  const [choice, setChoice] = useState(mode);
  const [markup, setMarkup] = useState(String(markupBps / 100));
  useActionFeedback(state);
  const preview = example ? storePriceFor({ priceCents: example.suggestedCents, salePriceCents: null, costCents: example.costCents }, { mode: choice, markupBps: Math.round(Number(markup || 0) * 100) }).priceCents : null;
  return (
    <form action={action} className="space-y-6">
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="sr-only">How your store sets prices</legend>
        {(
          [
            ["SUGGESTED", "Suggested prices", "Sell at the price recommended for each product, including its sale price when there is one."],
            ["MARKUP", "My own markup", "Add a percentage on top of what you pay. Prices are rounded to end in .99."],
          ] as const
        ).map(([value, title, text]) => (
          <label key={value} className="flex cursor-pointer gap-3 rounded-md border border-line p-4 has-[:checked]:border-ink-950 has-[:checked]:bg-canvas">
            <input type="radio" name="pricingMode" value={value} checked={choice === value} onChange={() => setChoice(value)} className="mt-1 accent-ink-950" />
            <span>
              <span className="block font-medium text-ink-950">{title}</span>
              <span className="mt-1 block text-[0.875rem] text-ink-600">{text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {choice === "MARKUP" && (
        <TextField name="markupPercent" label="Markup (%)" type="number" min={0} max={1000} step="1" value={markup} onChange={(event) => setMarkup(event.target.value)} wrapperClassName="max-w-xs" error={fieldError(state, "markupPercent")} />
      )}
      {example && preview !== null && (
        <div className="rounded-md bg-canvas p-4 text-[0.9375rem]">
          <p className="text-ink-600">
            Example: <span className="font-medium text-ink-950">{example.name}</span>
          </p>
          <p className="tabular mt-1 text-ink-700">
            You pay {formatMoney(example.costCents)} → sells for <span className="font-semibold text-ink-950">{formatMoney(preview)}</span> → you earn{" "}
            <span className={cn("font-semibold", preview - example.costCents > 0 ? "text-success" : "text-danger")}>{formatMoney(preview - example.costCents)}</span>
          </p>
        </div>
      )}
      <p className="text-[0.8125rem] text-ink-500">Products with their own markup or fixed price keep it. Change those on the Products page.</p>
      {state.status === "error" && <FormMessage state={state} />}
      <div className="flex justify-end">
        <SubmitButton>Save pricing</SubmitButton>
      </div>
    </form>
  );
}
