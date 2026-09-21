"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Field, Textarea, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { customerReplyAction, startConversationAction } from "@/features/support/actions";
import { idleState, type ActionState } from "@/lib/action-state";

/** Opens a conversation. A signed-in customer is taken to the thread; a guest gets a confirmation here. */
export function NewConversationForm({ defaults, signedIn }: { defaults: { name?: string; email?: string; subject?: string; orderNumber?: string }; signedIn: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(startConversationAction, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="hidden" aria-hidden>
        <label htmlFor="support-website">Website</label>
        <input id="support-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Your name" defaultValue={defaults.name ?? ""} autoComplete="name" required error={fieldError(state, "name")} />
        <TextField name="email" type="email" label="Email address" defaultValue={defaults.email ?? ""} autoComplete="email" required readOnly={signedIn} error={fieldError(state, "email")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="subject" label="Subject" defaultValue={defaults.subject ?? ""} required maxLength={120} error={fieldError(state, "subject")} />
        <TextField name="orderNumber" label="Order number" optional placeholder="VY-XXXX-XXXX" defaultValue={defaults.orderNumber ?? ""} maxLength={20} error={fieldError(state, "orderNumber")} />
      </div>
      <Field label="How can we help?" htmlFor="support-message" error={fieldError(state, "message")}>
        <Textarea id="support-message" name="message" rows={6} required maxLength={4000} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" pendingLabel="Sending…">
        Send message
      </SubmitButton>
      {!signedIn && <p className="text-[0.8125rem] text-ink-500">We will reply to this email address. Create an account to follow the conversation here instead.</p>}
    </form>
  );
}

/** Writing back inside an existing thread. */
export function CustomerReplyForm({ messageId }: { messageId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(customerReplyAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  // Clearing the box and pulling in the new turn happen after the send, never during render.
  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={formRef} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="messageId" value={messageId} />
      <Field label="Your reply" htmlFor="support-reply" error={fieldError(state, "body")}>
        <Textarea id="support-reply" name="body" rows={4} required maxLength={4000} placeholder="Add anything that might help us…" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Sending…">
        <Send className="size-4" aria-hidden /> Send reply
      </SubmitButton>
    </form>
  );
}
