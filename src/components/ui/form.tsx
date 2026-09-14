"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action-state";
import { Button } from "./button";
import { Alert } from "./misc";

/** Submit button that shows a spinner while its parent form's action is pending. */
export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} aria-label={pending && pendingLabel ? pendingLabel : undefined} {...props}>
      {children}
    </Button>
  );
}

export function FormMessage({ state, className }: { state: ActionState<unknown>; className?: string }) {
  if (state.status === "error") {
    return (
      <Alert tone="danger" className={className}>
        {state.message}
      </Alert>
    );
  }
  if (state.status === "success" && state.message) {
    return (
      <Alert tone="success" className={className}>
        {state.message}
      </Alert>
    );
  }
  return null;
}

export function fieldError(state: ActionState<unknown>, name: string) {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}
