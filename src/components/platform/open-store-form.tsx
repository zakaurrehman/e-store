"use client";

import { Check, Globe, Ticket, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { PasswordInput } from "@/components/store/auth/auth-forms";
import { Field, Input, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { checkReferralCodeAction, type ReferralCheck } from "@/features/referrals/actions";
import { checkStoreSlugAction, openStoreAction, type SlugCheck } from "@/features/stores/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";

/**
 * Opens a store in one step. Signed-in users only name their store; new visitors also create their account.
 * The store address is suggested from the name as they type and checked for availability.
 */
export function OpenStoreForm({
  signedInAs,
  addProductId,
  baseDomain,
  inviteOnly,
}: {
  signedInAs: string | null;
  addProductId?: string;
  baseDomain: string;
  /** Stores are invitation-only: the code is checked again on the server when the form is submitted. */
  inviteOnly: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(openStoreAction, idleState);
  const [values, setValues] = useState({ storeName: "", firstName: "", lastName: "", email: "", password: "" });
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const [check, setCheck] = useState<SlugCheck | null>(null);
  const [referral, setReferral] = useState("");
  // The result remembers which code it was for, so a stale answer is never shown against a changed code.
  const [checked, setChecked] = useState<(ReferralCheck & { code: string }) | null>(null);
  const referralCheck = checked && checked.code === referral ? checked : null;

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  // Debounced availability check for the address.
  useEffect(() => {
    const input = customSlug !== null ? { slug: customSlug } : { name: values.storeName };
    if (!input.slug && (input.name ?? "").trim().length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await checkStoreSlugAction(input);
      if (!cancelled) setCheck(result);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [values.storeName, customSlug]);

  // Debounced check of the invitation code, so people find out before they fill the rest in.
  useEffect(() => {
    if (!inviteOnly) return;
    const typed = referral.replace(/[^0-9A-Za-z]/g, "");
    if (typed.replace(/^([Zz][Dd])/, "").length < 8) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await checkReferralCodeAction(referral);
      if (!cancelled) setChecked({ ...result, code: referral });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [referral, inviteOnly]);

  const slug = customSlug ?? check?.slug ?? "";
  const showCheck = !!check && (customSlug !== null || values.storeName.trim().length >= 2);

  return (
    <form action={action} className="space-y-5" noValidate>
      {addProductId && <input type="hidden" name="add" value={addProductId} />}

      {inviteOnly && (
        <Field
          label="Invitation code"
          htmlFor="referral-code"
          error={fieldError(state, "referralCode")}
          hint="Zendropship stores are invitation-only. Your code looks like ZD-7K4P9X2M."
        >
          <div className="flex items-stretch overflow-hidden rounded-sm border border-line-strong focus-within:border-ink-950">
            <span className="flex items-center bg-canvas pl-3 text-ink-500" aria-hidden>
              <Ticket className="size-4" />
            </span>
            <Input
              id="referral-code"
              name="referralCode"
              value={referral}
              onChange={(event) => setReferral(event.target.value.toUpperCase().slice(0, 20))}
              placeholder="ZD-XXXXXXXX"
              autoComplete="off"
              spellCheck={false}
              required
              aria-invalid={referralCheck?.ok === false || !!fieldError(state, "referralCode") || undefined}
              className="min-w-0 flex-1 rounded-none border-0 bg-canvas px-2 font-mono tracking-[0.08em] focus:ring-0"
            />
          </div>
          {referralCheck?.message && (
            <p className={cn("mt-2 flex items-center gap-1.5 text-[0.8125rem]", referralCheck.ok ? "text-success" : "text-danger")} aria-live="polite">
              {referralCheck.ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              {referralCheck.message}
            </p>
          )}
        </Field>
      )}

      <TextField
        name="storeName"
        label="Store name"
        placeholder="e.g. Maya’s Closet"
        autoComplete="organization"
        required
        maxLength={60}
        value={values.storeName}
        onChange={set("storeName")}
        error={fieldError(state, "storeName")}
      />

      <Field label="Store address" htmlFor="store-slug" error={fieldError(state, "slug")} hint="Letters, digits and hyphens. You can connect your own domain later.">
        <div className="flex items-stretch overflow-hidden rounded-sm border border-line-strong focus-within:border-ink-950">
          <span className="flex items-center bg-canvas pl-3 text-ink-500" aria-hidden>
            <Globe className="size-4" />
          </span>
          <Input
            id="store-slug"
            name="slug"
            value={slug}
            onChange={(event) => setCustomSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30))}
            placeholder="your-store"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-none border-0 bg-canvas px-2 focus:ring-0"
          />
          <span className="flex items-center whitespace-nowrap bg-canvas pr-3 text-[0.9375rem] text-ink-500">.{baseDomain}</span>
        </div>
        {showCheck && slug && (
          <p className={cn("mt-2 flex items-center gap-1.5 text-[0.8125rem]", check.available ? "text-success" : "text-danger")} aria-live="polite">
            {check.available ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
            {check.available ? `${check.url.replace(/^https?:\/\//, "")} is available` : (check.message ?? "Not available")}
          </p>
        )}
      </Field>

      {signedInAs ? (
        <p className="rounded-sm bg-canvas px-4 py-3 text-[0.9375rem] text-ink-700">
          The store will belong to <strong className="font-medium text-ink-950">{signedInAs}</strong>.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="firstName" label="First name" autoComplete="given-name" required value={values.firstName} onChange={set("firstName")} error={fieldError(state, "firstName")} />
            <TextField name="lastName" label="Last name" autoComplete="family-name" required value={values.lastName} onChange={set("lastName")} error={fieldError(state, "lastName")} />
          </div>
          <TextField name="email" type="email" label="Email address" autoComplete="email" required value={values.email} onChange={set("email")} error={fieldError(state, "email")} />
          <Field label="Password" htmlFor="start-password" error={fieldError(state, "password")} hint="At least 10 characters.">
            <PasswordInput id="start-password" name="password" autoComplete="new-password" required value={values.password} onChange={set("password")} aria-invalid={!!fieldError(state, "password") || undefined} />
          </Field>
        </>
      )}

      <FormMessage state={state} />
      <SubmitButton fullWidth size="lg" pendingLabel="Opening your store…">
        Create my store
      </SubmitButton>
      {!signedInAs && <p className="text-center text-[0.8125rem] text-ink-500">By creating a store you agree to our terms and privacy policy.</p>}
      {inviteOnly && !signedInAs && (
        <p className="text-center text-[0.8125rem] text-ink-500">
          No code yet?{" "}
          <a href="/contact" className="text-ink-950 underline underline-offset-4">
            Ask Zendropship for an invitation
          </a>
          .
        </p>
      )}
    </form>
  );
}
