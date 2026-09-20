import Image from "next/image";
import type { StoreContext } from "@/features/stores/context";
import { cn } from "@/utils/cn";

/** The store's own logo, or its name set as a wordmark when no logo has been uploaded. */
export function StoreBrand({ store, className, tone = "dark" }: { store: Pick<StoreContext, "name" | "logoUrl">; className?: string; tone?: "dark" | "light" }) {
  if (store.logoUrl) {
    return <Image src={store.logoUrl} alt={store.name} width={160} height={40} className={cn("h-8 w-auto max-w-40 object-contain", className)} />;
  }
  return (
    <span className={cn("font-sans text-[0.9375rem] font-semibold uppercase tracking-[0.2em]", tone === "light" ? "text-white" : "text-ink-950", className)}>
      {store.name}
    </span>
  );
}
