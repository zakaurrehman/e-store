"use client";

import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; title: string; description?: string; tone: ToastTone };
type ToastInput = { title: string; description?: string; tone?: ToastTone; durationMs?: number };

const ToastContext = createContext<((input: ToastInput) => void) | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const show = useCallback(
    ({ title, description, tone = "success", durationMs = 4500 }: ToastInput) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-2), { id, title, description, tone }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:p-6"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertCircle : Info;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm animate-rise-in items-start gap-3 rounded-md bg-ink-950 px-4 py-3.5 text-white shadow-pop"
            >
              <Icon
                className={cn("mt-0.5 size-[1.125rem] shrink-0", toast.tone === "success" && "text-[#7ee2b8]", toast.tone === "error" && "text-[#ff9b9b]", toast.tone === "info" && "text-iris-100")}
                strokeWidth={2}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-300">{toast.description}</p>}
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} className="-mr-1 rounded-xs p-1 text-ink-400 hover:text-white" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
