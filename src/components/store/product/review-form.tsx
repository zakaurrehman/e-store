"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { submitReviewAction } from "@/features/reviews/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export function ReviewForm({ productId, imagesEnabled }: { productId: string; imagesEnabled: boolean }) {
  const [state, action] = useActionState<ActionState<{ pending: boolean }>, FormData>(submitReviewAction, idleState);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  if (state.status === "success") return <FormMessage state={state} />;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="productId" value={productId} />
      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-ink-800">Your rating</legend>
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
      <Field label="Headline" htmlFor="review-title" error={fieldError(state, "title")}>
        <Input id="review-title" name="title" maxLength={120} required placeholder="Sum up your experience" aria-invalid={!!fieldError(state, "title") || undefined} />
      </Field>
      <Field label="Review" htmlFor="review-body" error={fieldError(state, "body")} hint="What did you like? How is the fit, quality or finish?">
        <Textarea id="review-body" name="body" rows={5} maxLength={4000} required aria-invalid={!!fieldError(state, "body") || undefined} />
      </Field>
      {imagesEnabled && (
        <Field label="Photos" htmlFor="review-images" optional error={fieldError(state, "images")} hint="Up to 4 JPEG, PNG or WebP images, 10 MB each.">
          <input id="review-images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="block w-full text-sm text-ink-600 file:mr-4 file:h-10 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-medium file:text-ink-950 hover:file:border-ink-950" />
        </Field>
      )}
      <FormMessage state={state} />
      <SubmitButton>Submit review</SubmitButton>
    </form>
  );
}
