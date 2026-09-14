"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, type ComponentProps } from "react";
import { Checkbox, Field, Input, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { forgotPasswordAction, loginAction, registerAction, resendVerificationAction, resetPasswordAction } from "@/features/auth/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";

export function PasswordInput({ id, ...props }: ComponentProps<"input"> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} className="pr-11" {...props} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xs text-ink-500 hover:text-ink-950"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(loginAction, idleState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {notice && <Alert tone="success">{notice}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField name="email" type="email" label="Email address" autoComplete="email" required error={fieldError(state, "email")} />
      <Field label="Password" htmlFor="login-password" error={fieldError(state, "password")}>
        <PasswordInput id="login-password" name="password" autoComplete="current-password" required aria-invalid={!!fieldError(state, "password") || undefined} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
          Forgot password?
        </Link>
      </div>
      <FormMessage state={state} />
      <SubmitButton fullWidth size="lg">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(registerAction, idleState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="firstName" label="First name" autoComplete="given-name" required error={fieldError(state, "firstName")} />
        <TextField name="lastName" label="Last name" autoComplete="family-name" required error={fieldError(state, "lastName")} />
      </div>
      <TextField name="email" type="email" label="Email address" autoComplete="email" required error={fieldError(state, "email")} />
      <Field label="Password" htmlFor="register-password" error={fieldError(state, "password")} hint="At least 10 characters, mixing letters with numbers or symbols.">
        <PasswordInput id="register-password" name="password" autoComplete="new-password" required minLength={10} aria-invalid={!!fieldError(state, "password") || undefined} />
      </Field>
      <Checkbox id="marketingOptIn" name="marketingOptIn" label="Email me about new arrivals and offers. You can unsubscribe at any time." />
      <FormMessage state={state} />
      <SubmitButton fullWidth size="lg">
        Create account
      </SubmitButton>
      <p className="text-center text-[0.8125rem] leading-relaxed text-ink-500">
        By creating an account you agree to our{" "}
        <Link href="/pages/terms" className="underline underline-offset-2">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/pages/privacy" className="underline underline-offset-2">
          Privacy policy
        </Link>
        .
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(forgotPasswordAction, idleState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-5" noValidate>
      <TextField name="email" type="email" label="Email address" autoComplete="email" required error={fieldError(state, "email")} />
      <FormMessage state={state} />
      <SubmitButton fullWidth size="lg">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resetPasswordAction, idleState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="reset-password" error={fieldError(state, "password")} hint="At least 10 characters, mixing letters with numbers or symbols.">
        <PasswordInput id="reset-password" name="password" autoComplete="new-password" required aria-invalid={!!fieldError(state, "password") || undefined} />
      </Field>
      <Field label="Confirm new password" htmlFor="reset-confirm" error={fieldError(state, "confirmPassword")}>
        <PasswordInput id="reset-confirm" name="confirmPassword" autoComplete="new-password" required aria-invalid={!!fieldError(state, "confirmPassword") || undefined} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton fullWidth size="lg">
        Set new password
      </SubmitButton>
    </form>
  );
}

export function ResendVerificationButton() {
  const [state, action, pending] = useActionState<ActionState>(resendVerificationAction, idleState);
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Resend confirmation email
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
