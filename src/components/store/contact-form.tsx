"use client";

import { useActionState } from "react";
import { Field, Textarea, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { submitContactAction } from "@/features/contact/actions";
import { idleState, type ActionState } from "@/lib/action-state";

export function ContactForm({ defaults }: { defaults: { name?: string; email?: string; orderNumber?: string } }) {
  const [state, action] = useActionState<ActionState, FormData>(submitContactAction, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="hidden" aria-hidden>
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Your name" defaultValue={defaults.name ?? ""} autoComplete="name" required error={fieldError(state, "name")} />
        <TextField name="email" type="email" label="Email address" defaultValue={defaults.email ?? ""} autoComplete="email" required error={fieldError(state, "email")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="subject" label="Subject" required maxLength={120} error={fieldError(state, "subject")} />
        <TextField name="orderNumber" label="Order number" optional placeholder="VY-XXXX-XXXX" defaultValue={defaults.orderNumber ?? ""} maxLength={20} error={fieldError(state, "orderNumber")} />
      </div>
      <Field label="Message" htmlFor="contact-message" error={fieldError(state, "message")}>
        <Textarea id="contact-message" name="message" rows={6} required maxLength={4000} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg">Send message</SubmitButton>
    </form>
  );
}
