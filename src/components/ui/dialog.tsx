"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  // A tall sheet on a phone; a panel in the bottom-right corner, where its launcher is, from small screens up.
  // On a phone it hangs from the top of the visible area rather than resting on the bottom (see
  // useVisibleArea). Once it is only a corner of the screen it stops dimming the page behind it, so it stays
  // out of the way.
  corner:
    "mx-0 mb-0 mt-[8svh] h-[92svh] max-h-[92svh] w-full max-w-none rounded-t-xl animate-slide-in-up " +
    "sm:mb-4 sm:mr-4 sm:ml-auto sm:mt-auto sm:h-auto sm:w-[23.5rem] sm:max-h-[min(80dvh,38rem)] sm:rounded-lg sm:animate-rise-in " +
    "sm:[&::backdrop]:bg-transparent sm:[&::backdrop]:[backdrop-filter:none]",
};

type VisibleArea = { top: number; height: number };

/**
 * The part of a phone's screen that can actually be seen while the dialog is open (null on larger screens).
 * A phone browser's idea of where the page ends is not where the screen ends: Chrome on iPhone draws its
 * toolbar over the bottom of the page, and the on-screen keyboard covers it without the page shrinking.
 * A dialog placed against the page can have its lower half — fields, and the button that sends the form —
 * underneath either, where no amount of scrolling brings it out. The visual viewport is what is really on
 * screen, so dialogs on a phone are placed and sized against it.
 */
function useVisibleArea(open: boolean) {
  const [area, setArea] = useState<VisibleArea | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const phone = window.matchMedia("(max-width: 639.98px)");
    const follow = () => setArea(phone.matches ? { top: Math.round(viewport.offsetTop), height: Math.round(viewport.height) } : null);
    follow();
    viewport.addEventListener("resize", follow);
    viewport.addEventListener("scroll", follow);
    phone.addEventListener("change", follow);
    return () => {
      viewport.removeEventListener("resize", follow);
      viewport.removeEventListener("scroll", follow);
      phone.removeEventListener("change", follow);
    };
  }, [open]);
  return open ? area : null;
}

/**
 * Where each kind of dialog goes within the visible area on a phone. Nothing is measured: `translate` moves
 * a dialog by its own height, and it composes with the entrance animations, which use `transform`.
 */
function placeInVisibleArea(variant: DialogVariant, area: VisibleArea): CSSProperties {
  const edge = { bottom: "auto", marginTop: 0, marginBottom: 0 } satisfies CSSProperties;
  switch (variant) {
    case "center":
      // Centred in what can be seen, with a margin above and below.
      return { ...edge, top: area.top + area.height / 2, translate: "0 -50%", maxHeight: area.height - 24 };
    case "bottom":
      // Resting on the bottom of what can be seen — the top of the keyboard, when it is open.
      return { ...edge, top: area.top + area.height, translate: "0 -100%", maxHeight: area.height - Math.min(56, Math.round(area.height * 0.08)) };
    case "left":
    case "right":
      return { ...edge, top: area.top, height: area.height, maxHeight: area.height };
    case "corner": {
      // A strip of the page stays visible above the sheet (tap it to close), except when space is short.
      const gap = Math.min(56, Math.round(area.height * 0.08));
      return { marginTop: area.top + gap, height: area.height - gap, maxHeight: area.height - gap };
    }
  }
}

/**
 * Accessible modal built on the native <dialog> element: focus is trapped and restored by the browser,
 * Escape closes it, and the page behind is inert. Used for modals, side drawers and mobile bottom sheets.
 * On a phone every kind is fitted to the visible part of the screen (see useVisibleArea), and the field being
 * typed in is brought back into view when the keyboard opens.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = "center", hideTitle, className, bodyClassName, style }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const area = useVisibleArea(open);
  const fitted = area ? { ...placeInVisibleArea(variant, area), ...style } : style;
  // With the keyboard open on a small phone there is little room left: the header shrinks to one line and
  // the description is left to screen readers, so the field being typed in keeps the space.
  const compact = !!area && area.height < 440;

  // When the visible area changes — the keyboard opening, usually — bring the field being typed in back into
  // view, with the form's submit button as close as it will come, so the form can be sent without a hunt.
  const visibleHeight = area?.height;
  useEffect(() => {
    const dialog = ref.current;
    if (!visibleHeight || !dialog) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !dialog.contains(active) || !active.matches("input, textarea, select")) return;
    active.closest("form")?.querySelector<HTMLElement>('button[type="submit"]')?.scrollIntoView({ block: "nearest" });
    active.scrollIntoView({ block: "nearest" });
  }, [visibleHeight]);

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
      style={fitted}
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
        // text-left and whitespace-normal because a dialog opened from a table cell inherits its alignment and
        // its no-wrap, which would push long lines out of the dialog.
        "flex-col overflow-hidden border-0 bg-surface p-0 text-left whitespace-normal text-ink-950 shadow-pop backdrop:animate-fade-in open:flex",
        variantClasses[variant],
        className,
      )}
    >
      <div className={cn("flex shrink-0 items-start justify-between gap-4 px-5 sm:px-6", compact ? "pt-3" : "pt-5", hideTitle ? "pb-0" : compact ? "pb-2" : "pb-4")}>
        <div className={cn("min-w-0", hideTitle && "sr-only")}>
          <h2 id={titleId} className={cn("font-semibold tracking-[-0.01em]", compact ? "truncate text-base" : "text-lg")}>
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className={cn("mt-1 text-sm text-ink-500", compact && "sr-only")}>
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
