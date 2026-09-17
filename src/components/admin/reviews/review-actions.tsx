"use client";

import { useState } from "react";
import { ActionButton, ActionForm } from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { moderateReviewAction, replyToReviewAction } from "@/features/admin/reviews";

export function ReviewActions({ review }: { review: { id: string; status: string; isFeatured: boolean; adminReply: string | null } }) {
  const [replyOpen, setReplyOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-1.5">
      {review.status !== "APPROVED" && (
        <ActionButton size="xs" variant="primary" action={() => moderateReviewAction(review.id, "approve")}>
          Approve
        </ActionButton>
      )}
      {review.status === "PENDING" && (
        <ActionButton size="xs" action={() => moderateReviewAction(review.id, "reject")}>
          Reject
        </ActionButton>
      )}
      {review.status === "APPROVED" && (
        <ActionButton size="xs" action={() => moderateReviewAction(review.id, "hide")}>
          Hide
        </ActionButton>
      )}
      {review.status === "APPROVED" && (
        <ActionButton size="xs" action={() => moderateReviewAction(review.id, review.isFeatured ? "unfeature" : "feature")}>
          {review.isFeatured ? "Unfeature" : "Feature"}
        </ActionButton>
      )}
      <Button size="xs" variant="secondary" onClick={() => setReplyOpen(true)}>
        {review.adminReply ? "Edit reply" : "Reply"}
      </Button>
      <ActionButton size="xs" variant="ghost" className="text-danger hover:bg-danger-soft" action={() => moderateReviewAction(review.id, "delete")} confirm={{ title: "Delete this review?", destructive: true, confirmLabel: "Delete" }}>
        Delete
      </ActionButton>
      <Dialog open={replyOpen} onClose={() => setReplyOpen(false)} title="Public reply" description="Shown under the review as “Response from Zendropship”.">
        <ActionForm action={replyToReviewAction.bind(null, review.id)} submitLabel="Save reply" onSuccess={() => setReplyOpen(false)}>
          <Textarea name="reply" rows={4} defaultValue={review.adminReply ?? ""} maxLength={1000} placeholder="Thank you for your feedback…" />
        </ActionForm>
      </Dialog>
    </div>
  );
}
