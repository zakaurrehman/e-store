import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { idleState, type ActionState } from "@/lib/action-state";
import { isDomainError } from "@/server/errors";

export { idleState, type ActionState };

export function success<T>(message?: string, data?: T): ActionState<T> {
  return { status: "success", message, data };
}

export function failure(message: string, fieldErrors?: Record<string, string[]>): ActionState<never> {
  return { status: "error", message, fieldErrors };
}

export function zodFailure(error: z.ZodError, message = "Please check the highlighted fields."): ActionState<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return failure(message, fieldErrors);
}

/**
 * Converts thrown errors into an ActionState. Redirects and other Next.js control-flow errors are rethrown.
 * Unexpected errors are logged and replaced with a generic message so internals never leak to users.
 */
export function handleActionError(error: unknown): ActionState<never> {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return zodFailure(error);
  if (isDomainError(error)) return failure(error.message, error.fieldErrors);
  console.error("[action] unexpected error", error);
  return failure("Something went wrong on our side. Please try again.");
}

/** Reads a FormData into a plain object; repeated keys become arrays. */
export function formDataToObject(formData: FormData) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const current = result[key];
    if (current === undefined) result[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else result[key] = [current, value];
  }
  return result;
}
