"use client";

import { useActionState } from "react";
import { PasswordInput } from "@/components/store/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { updateProfileAction, signOutOtherSessionsAction } from "@/features/account/actions";
import { changePasswordAction } from "@/features/auth/actions";
import { idleState, type ActionState } from "@/lib/action-state";

export function ProfileForm({ profile }: { profile: { firstName: string; lastName: string; email: string; phone: string | null; marketingOptIn: boolean } }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfileAction, idleState);
  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="firstName" label="First name" defaultValue={profile.firstName} autoComplete="given-name" required error={fieldError(state, "firstName")} />
        <TextField name="lastName" label="Last name" defaultValue={profile.lastName} autoComplete="family-name" required error={fieldError(state, "lastName")} />
      </div>
      <Field label="Email address" htmlFor="profile-email" hint="Contact customer care to change the email on your account.">
        <Input id="profile-email" value={profile.email} readOnly disabled />
      </Field>
      <Field label="Phone" htmlFor="profile-phone" optional error={fieldError(state, "phone")}>
        <Input id="profile-phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" />
      </Field>
      <Checkbox id="profile-marketing" name="marketingOptIn" defaultChecked={profile.marketingOptIn} label="Email me about new arrivals and offers" />
      <FormMessage state={state} />
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, idleState);
  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <Field label="Current password" htmlFor="current-password" error={fieldError(state, "currentPassword")}>
        <PasswordInput id="current-password" name="currentPassword" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="new-password" error={fieldError(state, "password")} hint="At least 10 characters, mixing letters with numbers or symbols.">
        <PasswordInput id="new-password" name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm-password" error={fieldError(state, "confirmPassword")}>
        <PasswordInput id="confirm-password" name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}

export function SignOutOtherSessions({ count }: { count: number }) {
  const [state, action, pending] = useActionState<ActionState>(signOutOtherSessionsAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <p className="text-[0.9375rem] text-ink-600">{count === 0 ? "You're only signed in on this device." : `You're signed in on ${count + 1} devices.`}</p>
      <Button type="submit" variant="secondary" loading={pending} disabled={count === 0 && state.status !== "success"}>
        Sign out other devices
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
