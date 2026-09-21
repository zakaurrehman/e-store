"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { replyToMessageAction, setStoreMessageStatusAction } from "@/features/support/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Reply box under a customer's message: sends the reply by email in the store's name. */
export function ReplyForm({ messageId, customerName }: { messageId: string; customerName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(replyToMessageAction, idleState);
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.message) toast({ title: state.message });
    formRef.current?.reset();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={action} className="mt-6 border-t border-line pt-5">
      <input type="hidden" name="messageId" value={messageId} />
      <Field label={`Reply to ${customerName}`} htmlFor="support-reply" error={fieldError(state, "body")} hint="Sent by email from your store, so the customer can reply to you directly.">
        <Textarea id="support-reply" name="body" rows={5} maxLength={4000} required placeholder="Write your reply…" />
      </Field>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Checkbox name="resolve" label="Mark as resolved" />
        <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
      </div>
      {state.status === "error" && <FormMessage state={state} className="mt-3" />}
    </form>
  );
}

export function StatusButton({ messageId, status, children }: { messageId: string; status: "NEW" | "IN_PROGRESS" | "RESOLVED"; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setStoreMessageStatusAction(messageId, status);
          if (result.status === "error") toast({ title: result.message, tone: "error" });
          else {
            if (result.status === "success" && result.message) toast({ title: result.message });
            router.refresh();
          }
        })
      }
    >
      {children}
    </Button>
  );
}
