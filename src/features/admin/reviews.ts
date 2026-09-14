"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CATALOG_TAG, productTag } from "@/features/catalog/queries";
import { reviewsTag } from "@/features/reviews/queries";
import { moderateReview } from "@/features/reviews/service";
import { handleActionError, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";

export async function moderateReviewAction(reviewId: string, action: "approve" | "reject" | "hide" | "feature" | "unfeature" | "delete", reply?: string | null): Promise<ActionState> {
  try {
    const user = await assertPermission("reviews.moderate");
    const product = await moderateReview(reviewId, action, user.id, reply);
    updateTag(reviewsTag(product.id));
    updateTag(productTag(product.slug));
    updateTag(CATALOG_TAG);
    revalidatePath("/admin/reviews");
    return { status: "success", message: { approve: "Review approved.", reject: "Review rejected.", hide: "Review hidden.", feature: "Review featured on the homepage.", unfeature: "Review unfeatured.", delete: "Review deleted." }[action] };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function replyToReviewAction(reviewId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("reviews.moderate");
    const reply = String(formData.get("reply") ?? "").trim().slice(0, 1000);
    const review = await (await import("@/server/db")).db.review.findUnique({ where: { id: reviewId }, select: { status: true } });
    if (!review) return { status: "error", message: "Review not found." };
    const product = await moderateReview(reviewId, review.status === "APPROVED" ? "approve" : review.status === "HIDDEN" ? "hide" : review.status === "REJECTED" ? "reject" : "approve", user.id, reply || null);
    updateTag(reviewsTag(product.id));
    revalidatePath("/admin/reviews");
    return { status: "success", message: reply ? "Reply saved." : "Reply removed." };
  } catch (error) {
    return handleActionError(error);
  }
}
