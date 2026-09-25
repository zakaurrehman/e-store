"use client";

import { ActionButton } from "@/components/admin/forms";
import { moderateStoreReviewAction, removeDemoStoreReviewsAction } from "@/features/store-reviews/actions";

/** What staff can do with one store review. */
export function StoreReviewModeration({ review }: { review: { id: string; status: string; reported: boolean } }) {
  return (
    <div className="flex flex-wrap gap-2">
      {review.status !== "APPROVED" && (
        <ActionButton action={moderateStoreReviewAction.bind(null, review.id, "approve")} size="xs" variant="primary">
          Publish
        </ActionButton>
      )}
      {review.status !== "HIDDEN" && (
        <ActionButton action={moderateStoreReviewAction.bind(null, review.id, "hide")} size="xs">
          Hide
        </ActionButton>
      )}
      {review.status === "PENDING" && (
        <ActionButton action={moderateStoreReviewAction.bind(null, review.id, "reject")} size="xs" variant="ghost">
          Reject
        </ActionButton>
      )}
      {review.reported && (
        <ActionButton action={moderateStoreReviewAction.bind(null, review.id, "dismiss-report")} size="xs" variant="ghost">
          Dismiss report
        </ActionButton>
      )}
      <ActionButton
        action={moderateStoreReviewAction.bind(null, review.id, "delete")}
        size="xs"
        variant="ghost"
        className="text-danger"
        confirm={{ title: "Delete this review?", description: "It disappears from the store and the owner's dashboard. The customer cannot review the same order again.", confirmLabel: "Delete review", destructive: true }}
      >
        Delete
      </ActionButton>
    </div>
  );
}

/** Clears all demo reviews at once — for when stores are about to meet real customers. */
export function RemoveDemoStoreReviews({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <ActionButton
      action={removeDemoStoreReviewsAction}
      size="sm"
      variant="danger"
      confirm={{
        title: `Remove all ${count} demo reviews?`,
        description: "Every review marked as demo data is deleted from every store, and ratings are worked out again from real reviews only. Real customers' reviews are not touched.",
        confirmLabel: "Remove demo reviews",
        destructive: true,
      }}
    >
      Remove {count} demo review{count === 1 ? "" : "s"}
    </ActionButton>
  );
}
