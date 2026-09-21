"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { assignConversationAction, setConversationStatusAction, staffReplyAction } from "@/features/support/actions";
import { idleState, type ActionState } from "@/lib/action-state";

/** Reply box for Zendropship staff: an answer the customer receives, or a note only staff can see. */
export function StaffReplyForm({ messageId, customerName, replyingAs }: { messageId: string; customerName: string; replyingAs: string }) {
  const [state, action] = useActionState<ActionState, FormData>(staffReplyAction, idleState);
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
      <Field label={`Reply to ${customerName}`} htmlFor="staff-reply" error={fieldError(state, "body")} hint={`Sent by email as ${replyingAs}. Tick "internal note" to keep it out of the customer's inbox.`}>
        <Textarea id="staff-reply" name="body" rows={5} maxLength={4000} required placeholder="Write your reply…" />
      </Field>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <Checkbox name="resolve" label="Mark as resolved" />
          <Checkbox name="internal" label="Internal note (not emailed)" />
        </div>
        <SubmitButton pendingLabel="Saving…">Send</SubmitButton>
      </div>
      {state.status === "error" && <FormMessage state={state} className="mt-3" />}
    </form>
  );
}

export function ConversationStatusButton({ messageId, status, children }: { messageId: string; status: "NEW" | "IN_PROGRESS" | "RESOLVED"; children: React.ReactNode }) {
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
          const result = await setConversationStatusAction(messageId, status);
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

/** Hands a conversation to a colleague — or to yourself. */
export function AssignSelect({ messageId, assignedToId, staff }: { messageId: string; assignedToId: string | null; staff: Array<{ id: string; name: string }> }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Select
      aria-label="Assign to"
      defaultValue={assignedToId ?? ""}
      disabled={pending}
      className="h-9 text-[0.875rem]"
      onChange={(event) => {
        const value = event.target.value || null;
        startTransition(async () => {
          const result = await assignConversationAction(messageId, value);
          if (result.status === "error") toast({ title: result.message, tone: "error" });
          else {
            if (result.status === "success" && result.message) toast({ title: result.message });
            router.refresh();
          }
        });
      }}
    >
      <option value="">Unassigned</option>
      {staff.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </Select>
  );
}
