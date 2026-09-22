"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Field, Textarea, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { openOwnerTicketAction, ownerTicketReplyAction } from "@/features/support/actions";
import { idleState, type ActionState } from "@/lib/action-state";

/** Asks Zendropship something. The deposit or withdrawal it is about rides along hidden. */
export function NewTicketForm({ defaults }: { defaults: { subject?: string; message?: string; orderNumber?: string; depositId?: string; payoutId?: string } }) {
  const [state, action] = useActionState<ActionState, FormData>(openOwnerTicketAction, idleState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {defaults.depositId && <input type="hidden" name="depositId" value={defaults.depositId} />}
      {defaults.payoutId && <input type="hidden" name="payoutId" value={defaults.payoutId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="subject" label="Subject" defaultValue={defaults.subject ?? ""} required maxLength={120} error={fieldError(state, "subject")} />
        <TextField name="orderNumber" label="Order number" optional placeholder="VY-XXXX-XXXX" defaultValue={defaults.orderNumber ?? ""} maxLength={20} error={fieldError(state, "orderNumber")} />
      </div>
      <Field label="How can Zendropship help?" htmlFor="ticket-message" error={fieldError(state, "message")}>
        <Textarea id="ticket-message" name="message" rows={6} required maxLength={4000} defaultValue={defaults.message ?? ""} placeholder="Tell us what happened, with any references that might help…" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" pendingLabel="Sending…">
        Send to Zendropship
      </SubmitButton>
    </form>
  );
}

/** Writing back inside an existing Zendropship thread. */
export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(ownerTicketReplyAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const router = useRouter();
  // Clearing the box and pulling in the new turn happen after the send, never during render.
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.message) toast({ title: state.message });
    formRef.current?.reset();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <Field label="Your reply" htmlFor="ticket-reply" error={fieldError(state, "body")}>
        <Textarea id="ticket-reply" name="body" rows={4} required maxLength={4000} placeholder="Add anything that might help…" />
      </Field>
      {state.status === "error" && <FormMessage state={state} />}
      <SubmitButton pendingLabel="Sending…">
        <Send className="size-4" aria-hidden /> Send reply
      </SubmitButton>
    </form>
  );
}
