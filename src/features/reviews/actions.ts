"use server";

import { after } from "next/server";
import { updateTag } from "next/cache";
import { z } from "zod";
import { ingestImage, MAX_UPLOAD_BYTES } from "@/features/media/service";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";
import { failure, handleActionError, success, type ActionState } from "@/server/actions";
import { getCurrentUser } from "@/server/auth/session";
import { getRequestMeta } from "@/server/request";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { productTag } from "@/features/catalog/queries";
import { reviewsTag } from "./queries";
import { submitReview } from "./service";

const schema = z.object({
  productId: z.string().min(1).max(40),
  rating: z.coerce.number().int().min(1, "Choose a star rating.").max(5),
  title: z.string().trim().min(3, "Add a short headline (3+ characters).").max(120),
  body: z.string().trim().min(20, "Tell us a little more (20+ characters).").max(4000),
});

export async function submitReviewAction(_state: ActionState<{ pending: boolean }>, formData: FormData): Promise<ActionState<{ pending: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return failure("Sign in to write a review.");
  const parsed = schema.safeParse({ productId: formData.get("productId"), rating: formData.get("rating"), title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[String(issue.path[0])] ??= []).push(issue.message);
    return failure("Please check your review.", fieldErrors);
  }
  const meta = await getRequestMeta();
  const limit = await rateLimit("review", `${user.id}:${meta.ipAddress}`);
  if (!limit.success) return failure(retryAfterMessage(limit.resetAt));

  try {
    const files = formData.getAll("images").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 4);
    const imageIds: string[] = [];
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) return failure("Each photo must be 10 MB or smaller.", { images: ["Each photo must be 10 MB or smaller."] });
      const asset = await ingestImage({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, folder: "reviews", alt: `Customer photo for review`, uploadedById: user.id, maxDimension: 1600 });
      imageIds.push(asset.id);
    }
    const { review, productSlug } = await submitReview(user, { ...parsed.data, imageIds });
    updateTag(reviewsTag(parsed.data.productId));
    updateTag(productTag(productSlug));
    after(async () => sendDeliveries(await dispatchNotification({ type: "review.submitted", reviewId: review.id })));
    const pending = review.status === "PENDING";
    return success(pending ? "Thanks! Your review has been submitted and will appear once it's been checked." : "Thanks! Your review is now live.", { pending });
  } catch (error) {
    return handleActionError(error);
  }
}
