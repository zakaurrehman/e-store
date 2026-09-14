"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { idleState, type ActionState } from "@/lib/action-state";

/** Runs a server action from a button with an optional confirmation dialog; toasts the result. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  onSuccess,
}: {
  action: () => Promise<ActionState<unknown>>;
  children: ReactNode;
  confirm?: { title: string; description?: ReactNode; confirmLabel?: string; destructive?: boolean; requireText?: string };
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md";
  className?: string;
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const toast = useToast();
  const router = useRouter();
  const run = () =>
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") toast({ title: result.message, tone: "error" });
      else {
        if (result.status === "success" && result.message) toast({ title: result.message });
        setOpen(false);
        onSuccess?.();
        router.refresh();
      }
    });
  return (
    <>
      <Button variant={variant} size={size} className={className} loading={pending} disabled={disabled} onClick={() => (confirm ? setOpen(true) : run())}>
        {children}
      </Button>
      {confirm && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={confirm.title}
          description={confirm.description}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant={confirm.destructive ? "danger" : "primary"} loading={pending} disabled={!!confirm.requireText && typed !== confirm.requireText} onClick={run}>
                {confirm.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          }
        >
          {confirm.requireText ? (
            <div>
              <p className="text-sm text-ink-600">
                Type <span className="font-mono font-semibold text-ink-950">{confirm.requireText}</span> to confirm.
              </p>
              <Input className="mt-3" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
            </div>
          ) : (
            <p className="text-sm text-ink-600">This action takes effect immediately.</p>
          )}
        </Dialog>
      )}
    </>
  );
}

/** Wraps a form server action: shows messages, toasts success and optionally redirects. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className,
  redirectTo,
  onSuccess,
  footer,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (state: any, formData: FormData) => Promise<ActionState<unknown>>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  redirectTo?: string | ((data: unknown) => string);
  onSuccess?: (data: unknown) => void;
  footer?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, idleState as ActionState<unknown>);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.message) toast({ title: state.message });
    onSuccess?.(state.data);
    if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(state.data) : redirectTo);
    else router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.status === "error" && <FormMessage state={state} className="mt-4" />}
      <div className="mt-6 flex items-center justify-end gap-2">
        {footer}
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function useFieldErrors(state: ActionState<unknown>) {
  return state.status === "error" ? (state.fieldErrors ?? {}) : {};
}
