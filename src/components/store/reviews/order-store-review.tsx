import { Star } from "lucide-react";
import { RatingStars } from "@/components/ui/rating";
import { storeReviewForOrder } from "@/features/store-reviews/service";
import { StoreReviewForm } from "./store-review-form";

/**
 * On a delivered order's page: rate the store, or see the review already left for it. Nothing shows before
 * delivery — only customers whose order has arrived can review the store, and once per order.
 */
export async function OrderStoreReview({ order, token, storeName }: { order: { id: string; number: string; status: string }; token: string | null; storeName: string }) {
  if (order.status !== "DELIVERED") return null;
  const existing = await storeReviewForOrder(order.id);
  return (
    <section aria-labelledby="order-review-heading" className="mt-8 rounded-lg border border-line bg-surface p-5 md:p-6">
      <h2 id="order-review-heading" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
        <Star className="size-4.5" aria-hidden /> {existing ? "Your review" : `Review ${storeName}`}
      </h2>
      {existing ? (
        existing.deletedAt ? (
          <p className="mt-2 text-[0.9375rem] text-ink-600">You have already reviewed this order.</p>
        ) : (
          <div className="mt-3">
            <RatingStars value={existing.rating} size="md" />
            <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-800">{existing.body}</p>
            <p className="mt-2 text-[0.8125rem] text-ink-500">
              {existing.status === "APPROVED"
                ? "Thank you — it is on the store for other shoppers to read."
                : existing.status === "PENDING"
                  ? "Thank you — it will appear on the store once it has been checked."
                  : "This review isn't shown on the store."}
            </p>
            {existing.ownerReply && (
              <div className="mt-3 rounded-sm border-l-2 border-ink-950 bg-canvas px-3 py-2.5">
                <p className="text-[0.75rem] font-semibold text-ink-950">Reply from {storeName}</p>
                <p className="mt-1 whitespace-pre-line text-[0.875rem] text-ink-700">{existing.ownerReply}</p>
              </div>
            )}
          </div>
        )
      ) : (
        <>
          <p className="mt-1 text-[0.9375rem] text-ink-600">Your order has arrived. A few words help other shoppers — and the store.</p>
          <div className="mt-5">
            <StoreReviewForm orderNumber={order.number} token={token} storeName={storeName} />
          </div>
        </>
      )}
    </section>
  );
}
