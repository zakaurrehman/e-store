import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "inverse" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink-950 text-white hover:bg-ink-800",
  secondary: "border border-line-strong bg-surface text-ink-950 hover:border-ink-950",
  ghost: "text-ink-700 hover:bg-canvas hover:text-ink-950",
  accent: "bg-iris-600 text-white hover:bg-iris-700",
  danger: "bg-danger text-white hover:bg-[#a42222]",
  inverse: "bg-white text-ink-950 hover:bg-canvas",
  link: "h-auto px-0 text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-8 px-2.5 text-[0.8125rem] rounded-sm",
  sm: "h-9 px-3.5 text-sm rounded-sm",
  md: "h-11 px-5 text-[0.9375rem] rounded-sm",
  lg: "h-13 px-7 text-base rounded-md",
  icon: "size-10 rounded-sm",
  "icon-sm": "size-8 rounded-sm",
};

export function buttonStyles(options: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string } = {}) {
  const { variant = "primary", size = "md", fullWidth, className } = options;
  return cn(
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[-0.005em]",
    "transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-200 ease-out active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    variant !== "link" && sizes[size],
    variants[variant],
    fullWidth && "w-full",
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
};

export function Button({ variant, size, fullWidth, loading, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-4" />
        </span>
      )}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean };

export function ButtonLink({ variant, size, fullWidth, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonStyles({ variant, size, fullWidth, className })} {...props} />;
}
