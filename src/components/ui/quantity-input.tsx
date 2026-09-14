"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/utils/cn";

type QuantityInputProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  name?: string;
  className?: string;
};

export function QuantityInput({ value, onChange, min = 1, max = 99, disabled, size = "md", label = "Quantity", name, className }: QuantityInputProps) {
  const set = (next: number) => {
    if (Number.isNaN(next)) return;
    onChange(Math.max(min, Math.min(max, Math.trunc(next))));
  };
  const height = size === "sm" ? "h-9" : "h-11";
  const buttonClass = cn(
    "inline-flex w-9 items-center justify-center text-ink-600 transition-colors hover:text-ink-950 disabled:cursor-not-allowed disabled:text-ink-300",
    height,
  );
  return (
    <div className={cn("inline-flex items-stretch rounded-sm border border-line-strong bg-surface", disabled && "opacity-60", className)}>
      <button type="button" className={buttonClass} onClick={() => set(value - 1)} disabled={disabled || value <= min} aria-label={`Decrease ${label.toLowerCase()}`}>
        <Minus className="size-3.5" strokeWidth={2} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        name={name}
        aria-label={label}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => set(Number(event.target.value))}
        className={cn("tabular w-10 border-0 bg-transparent text-center text-[0.9375rem] font-medium text-ink-950 outline-none", height)}
      />
      <button type="button" className={buttonClass} onClick={() => set(value + 1)} disabled={disabled || value >= max} aria-label={`Increase ${label.toLowerCase()}`}>
        <Plus className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
