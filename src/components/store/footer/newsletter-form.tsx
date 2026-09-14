"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form";
import { subscribeToNewsletter } from "@/features/newsletter/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";

export function NewsletterForm({ source = "footer", tone = "light" }: { source?: string; tone?: "light" | "dark" }) {
  const [state, action] = useActionState<ActionState, FormData>(subscribeToNewsletter, idleState);
  if (state.status === "success") {
    return (
      <p role="status" className={cn("text-[0.9375rem]", tone === "dark" ? "text-white" : "text-ink-800")}>
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="w-full" noValidate>
      <input type="hidden" name="source" value={source} />
      <div className="flex gap-2">
        <label htmlFor={`newsletter-${source}`} className="sr-only">
          Email address
        </label>
        <input
          id={`newsletter-${source}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email address"
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "error" ? `newsletter-${source}-error` : undefined}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-sm border px-3.5 text-[0.9375rem] outline-none transition-colors",
            tone === "dark" ? "border-white/20 bg-white/5 text-white placeholder:text-white/50 focus:border-white" : "border-line-strong bg-surface text-ink-950 placeholder:text-ink-400 focus:border-ink-950",
          )}
        />
        <SubmitButton variant={tone === "dark" ? "inverse" : "primary"}>Subscribe</SubmitButton>
      </div>
      {state.status === "error" && (
        <p id={`newsletter-${source}-error`} className={cn("mt-2 text-[0.8125rem]", tone === "dark" ? "text-[#ffb4a8]" : "text-danger")}>
          {state.message}
        </p>
      )}
    </form>
  );
}
