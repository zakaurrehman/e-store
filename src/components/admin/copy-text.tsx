"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";

/** A value staff need to pass on (an invitation code, a reference) with one-click copying. */
export function CopyText({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("break-all", className)}>{value}</span>
      <button
        type="button"
        className="shrink-0 rounded-xs p-1 text-ink-400 hover:text-ink-950"
        aria-label={`Copy ${value}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}
