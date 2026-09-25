"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Field, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { submitStoreReviewAction } from "@/features/store-reviews/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const MAX = 1500;

/** Rate the store for a delivered order: stars and a few words. */
export function StoreReviewForm({ orderNumber, token, storeName }: { orderNumber: string; token: string | null; storeName: string }) {
  const [state, action] = useActionState<ActionState<{ pending: boolean }>, FormData>(submitStoreReviewAction, idleState);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state.status, router]);

  if (state.status === "success") return <FormMessage state={state} />;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      {token && <input type="hidden" name="token" value={token} />}
      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-ink-800">How was shopping with {storeName}?</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer rounded-xs p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-iris-500" onMouseEnter={() => setHover(value)}>
              <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} className="sr-only" />
              <Star className={cn("size-7 transition-colors", (hover || rating) >= value ? "fill-ink-950 text-ink-950" : "text-ink-300")} strokeWidth={1.5} />
              <span className="sr-only">
                {value} star{value === 1 ? "" : "s"} — {LABELS[value]}
              </span>
            </label>
          ))}
          <span className="ml-2 text-sm text-ink-600" aria-live="polite">
            {LABELS[hover || rating]}
          </span>
        </div>
        {fieldError(state, "rating") && <p className="mt-1.5 text-[0.8125rem] text-danger">{fieldError(state, "rating")![0]}</p>}
      </fieldset>
      <Field label="Your review" htmlFor="store-review-body" error={fieldError(state, "body")} hint={`Delivery, packaging, the products, how they looked after you — ${body.trim().length}/${MAX}`}>
        <Textarea
          id="store-review-body"
          name="body"
          rows={4}
          maxLength={MAX}
          required
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-invalid={!!fieldError(state, "body") || undefined}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Post review</SubmitButton>
    </form>
  );
}
