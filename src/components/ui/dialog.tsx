"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/utils/cn";

type DialogVariant = "center" | "right" | "left" | "bottom" | "corner";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: DialogVariant;
  /** Visually hide the title (still announced to assistive tech). */
  hideTitle?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Inline styles that depend on the moment, e.g. lifting a sheet above the on-screen keyboard. */
  style?: CSSProperties;
};

const variantClasses: Record<DialogVariant, string> = {
  center: "m-auto w-[min(calc(100vw-2rem),32rem)] max-h-[min(90dvh,48rem)] rounded-lg animate-rise-in",
  right: "my-0 ml-auto mr-0 h-dvh max-h-dvh w-[min(100vw,28rem)] animate-slide-in-right",
  left: "my-0 ml-0 mr-auto h-dvh max-h-dvh w-[min(100vw,24rem)] animate-slide-in-left",
  bottom:
    "mx-0 mb-0 mt-auto w-full max-w-none max-h-[90dvh] rounded-t-xl animate-slide-in-up sm:m-auto sm:w-[min(calc(100vw-2rem),36rem)] sm:rounded-lg sm:animate-rise-in",
  // A sheet on a phone; a panel in the bottom-right corner, where its launcher is, from small screens up.
  // Once it is only a corner of the screen it stops dimming the page behind it, so it stays out of the way.
  corner:
    "mx-0 mb-0 mt-auto w-full max-w-none max-h-[85dvh] rounded-t-xl animate-slide-in-up sm:mb-4 sm:mr-4 sm:ml-auto sm:w-[23.5rem] sm:max-h-[min(80dvh,38rem)] sm:rounded-lg sm:animate-rise-in " +
    "sm:[&::backdrop]:bg-transparent sm:[&::backdrop]:[backdrop-filter:none]",
};

/**
 * Accessible modal built on the native <dialog> element: focus is trapped and restored by the browser,
 * Escape closes it, and the page behind is inert. Used for modals, side drawers and mobile bottom sheets.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = "center", hideTitle, className, bodyClassName, style }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      if (open) document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      style={style}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // React propagates close/cancel through the component tree even though the native events don't bubble,
      // so a nested dialog (e.g. the media picker inside a form dialog) must not close its parent.
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        document.documentElement.style.overflow = "";
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        // text-left because a dialog opened from a right-aligned table cell inherits that alignment.
        "flex-col overflow-hidden border-0 bg-surface p-0 text-left text-ink-950 shadow-pop backdrop:animate-fade-in open:flex",
        variantClasses[variant],
        className,
      )}
    >
      <div className={cn("flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6", hideTitle ? "pb-0" : "pb-4")}>
        <div className={cn(hideTitle && "sr-only")}>
          <h2 id={titleId} className="text-lg font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm text-ink-500">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-1 ml-auto inline-flex size-9 items-center justify-center rounded-sm text-ink-500 transition-colors hover:bg-canvas hover:text-ink-950"
          aria-label="Close"
        >
          <X className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6", bodyClassName)}>{children}</div>
      {footer && <div className="shrink-0 border-t border-line bg-surface px-5 py-4 sm:px-6">{footer}</div>}
    </dialog>
  );
}
