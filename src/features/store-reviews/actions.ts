"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { assertStoreOwner } from "@/features/stores/guards";
import { getCurrentStore } from "@/features/stores/current";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { getCurrentUser } from "@/server/auth/session";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";
import { getRequestMeta } from "@/server/request";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { storeReviewsTag } from "./queries";
import { moderateStoreReview, removeDemoStoreReviews, replyToStoreReview, reportStoreReview, STORE_REVIEW_BODY, STORE_REVIEW_REPLY_MAX, submitStoreReview, type StoreReviewModeration } from "./service";

const reviewSchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  token: z.string().trim().max(200).optional().transform((value) => value || null),
  rating: z.coerce.number({ error: "Choose a star rating." }).int().min(1, "Choose a star rating.").max(5, "Choose a star rating."),
  body: z
    .string()
    .trim()
    .min(STORE_REVIEW_BODY.min, `Tell other shoppers a little more (${STORE_REVIEW_BODY.min}+ characters).`)
    .max(STORE_REVIEW_BODY.max, `Keep it under ${STORE_REVIEW_BODY.max} characters.`),
});

/** A customer rates the store for one of their delivered orders, from the order's page. */
export async function submitStoreReviewAction(_state: ActionState<{ pending: boolean }>, formData: FormData): Promise<ActionState<{ pending: boolean }>> {
  const parsed = reviewSchema.safeParse({ orderNumber: formData.get("orderNumber"), token: formData.get("token") ?? undefined, rating: formData.get("rating"), body: formData.get("body") });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const [store, user, meta] = await Promise.all([getCurrentStore(), getCurrentUser(), getRequestMeta()]);
    if (!store) return failure("Reviews are written from the store's own site.");
    if (!user && !parsed.data.token) return failure("Sign in, or open the order from the link in your email, to review it.");
    const limit = await rateLimit("review", `store:${user?.id ?? parsed.data.orderNumber}:${meta.ipAddress}`);
    if (!limit.success) return failure(retryAfterMessage(limit.resetAt));

    const review = await submitStoreReview({ storeId: store.id, orderNumber: parsed.data.orderNumber, rating: parsed.data.rating, body: parsed.data.body, author: { userId: user?.id ?? null, token: parsed.data.token } });
    updateTag(storeReviewsTag(store.id));
    after(async () => sendDeliveries(await dispatchNotification({ type: "store-review.submitted", reviewId: review.id })));
    const pending = review.status === "PENDING";
    return success(pending ? "Thank you! Your review will appear on the store once it has been checked." : "Thank you! Your review is now on the store.", { pending });
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Store owner ─────────────────────────────────────────────────────────────

export async function replyToStoreReviewAction(reviewId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const reply = String(formData.get("reply") ?? "");
  if (reply.trim().length > STORE_REVIEW_REPLY_MAX) return failure(`Keep your reply under ${STORE_REVIEW_REPLY_MAX} characters.`, { reply: [`Keep it under ${STORE_REVIEW_REPLY_MAX} characters.`] });
  try {
    const { user, store } = await assertStoreOwner();
    const review = await replyToStoreReview(store.id, String(reviewId).slice(0, 40), reply, user.id);
    updateTag(storeReviewsTag(store.id));
    revalidatePath("/dashboard/reviews");
    return success(review.ownerReply ? "Your reply is on the review." : "Your reply was removed.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function reportStoreReviewAction(reviewId: string, reason: string): Promise<ActionState> {
  try {
    const { user, store } = await assertStoreOwner();
    await reportStoreReview(store.id, String(reviewId).slice(0, 40), String(reason ?? ""), user.id);
    revalidatePath("/dashboard/reviews");
    revalidatePath("/admin/store-reviews");
    return success("Reported. Zendropship will check the review and hide it if it breaks the rules.");
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Staff ───────────────────────────────────────────────────────────────────

const ACTIONS: StoreReviewModeration[] = ["approve", "hide", "reject", "delete", "dismiss-report"];
const DONE: Record<StoreReviewModeration, string> = {
  approve: "Review published.",
  hide: "Review hidden from the store.",
  reject: "Review rejected.",
  delete: "Review deleted.",
  "dismiss-report": "Report set aside — the review stays as it is.",
};

export async function moderateStoreReviewAction(reviewId: string, action: StoreReviewModeration): Promise<ActionState> {
  try {
    const admin = await assertPermission("reviews.moderate");
    if (!ACTIONS.includes(action)) return failure("Unknown action.");
    const review = await moderateStoreReview(String(reviewId).slice(0, 40), action, admin.id);
    updateTag(storeReviewsTag(review.storeId));
    revalidatePath("/admin/store-reviews");
    return success(DONE[action]);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function removeDemoStoreReviewsAction(): Promise<ActionState> {
  try {
    const admin = await assertPermission("reviews.moderate");
    const { count, storeIds } = await removeDemoStoreReviews(admin.id);
    for (const storeId of storeIds) updateTag(storeReviewsTag(storeId));
    revalidatePath("/admin/store-reviews");
    return success(count === 0 ? "There were no demo reviews." : `Removed ${count} demo review${count === 1 ? "" : "s"}.`);
  } catch (error) {
    return handleActionError(error);
  }
}
