"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { replyToStoreReviewAction, reportStoreReviewAction } from "@/features/store-reviews/actions";
import { idleState, type ActionState } from "@/lib/action-state";

/** The owner's public answer, shown under the review on the store. Saving it empty removes it. */
export function OwnerReviewReply({ reviewId, reply }: { reviewId: string; reply: string | null }) {
  const [state, setState] = useState<ActionState>(idleState);
  const [editing, setEditing] = useState(!reply);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const save = (formData: FormData) =>
    startTransition(async () => {
      const result = await replyToStoreReviewAction(reviewId, idleState, formData);
      setState(result);
      if (result.status === "success") {
        if (result.message) toast({ title: result.message });
        setEditing(false);
        router.refresh();
      }
    });

  if (!editing) {
    return (
      <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
        {reply ? "Edit reply" : "Reply"}
      </Button>
    );
  }
  return (
    <form action={save} className="mt-3 space-y-2">
      <Field label="Your public reply" htmlFor={`reply-${reviewId}`} error={fieldError(state, "reply")} hint="Shown under the review on your store.">
        <Textarea id={`reply-${reviewId}`} name="reply" rows={3} maxLength={1000} defaultValue={reply ?? ""} />
      </Field>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Save reply
        </Button>
        {reply && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Asks Zendropship to check a review that breaks the rules. The owner cannot hide it themselves. */
export function ReportStoreReview({ reviewId, reported }: { reviewId: string; reported: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  if (reported) return <span className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-500"><Flag className="size-3.5" aria-hidden /> Reported — Zendropship is checking it</span>;

  const submit = () =>
    startTransition(async () => {
      const result = await reportStoreReviewAction(reviewId, reason);
      if (result.status === "error") {
        toast({ title: result.message, tone: "error" });
        return;
      }
      if (result.status === "success" && result.message) toast({ title: result.message });
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)} className="gap-1.5">
        <Flag className="size-3.5" aria-hidden /> Report
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report this review?"
        description="Zendropship checks it and hides it if it breaks the rules — abuse, spam, personal details, or not about your store."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button loading={pending} disabled={reason.trim().length < 5} onClick={submit}>
              Send report
            </Button>
          </div>
        }
      >
        <Field label="What is wrong with it?" htmlFor={`report-${reviewId}`}>
          <Textarea id={`report-${reviewId}`} rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}
