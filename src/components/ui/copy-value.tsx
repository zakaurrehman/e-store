"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";

/** A value shown in full — an address, a transaction id — with a button that copies it exactly. */
export function CopyValue({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={cn("flex items-start gap-2", className)}>
      <span className="min-w-0 flex-1 break-all font-mono text-[0.8125rem] text-ink-900">{value}</span>
      <button
        type="button"
        className="shrink-0 rounded-xs p-1 text-ink-500 hover:text-ink-950"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </span>
  );
}
