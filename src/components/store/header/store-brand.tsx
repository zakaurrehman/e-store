import Image from "next/image";
import type { StoreContext } from "@/features/stores/context";
import { cn } from "@/utils/cn";

export type BrandableStore = Pick<StoreContext, "name" | "logo">;

/** First letters of the store's name — the placeholder mark used until a logo is uploaded. */
export function storeInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`).toUpperCase();
}

/**
 * The store's own logo, at its real proportions, or its name set as a wordmark when there is none.
 * Always takes the store it belongs to, so one store's mark can never appear in another's.
 */
export function StoreBrand({ store, className, tone = "dark", height = 32 }: { store: BrandableStore; className?: string; tone?: "dark" | "light"; height?: number }) {
  if (store.logo) {
    // Real dimensions keep a square logo square and a wide one wide; height is fixed by the caller.
    const width = store.logo.width && store.logo.height ? Math.round((store.logo.width / store.logo.height) * height) : height * 4;
    return (
      <Image
        src={store.logo.url}
        alt={store.name}
        width={width}
        height={height}
        sizes={`${width * 2}px`}
        className={cn("w-auto max-w-[min(14rem,60vw)] object-contain object-left", className)}
        style={{ height }}
        priority={false}
      />
    );
  }
  return (
    <span className={cn("font-sans text-[0.9375rem] font-semibold uppercase tracking-[0.2em]", tone === "light" ? "text-white" : "text-ink-950", className)}>
      {store.name}
    </span>
  );
}

/**
 * A compact, square version for tight spaces (order cards, dashboards, admin tables): the logo when there
 * is one, otherwise a neutral tile with the store's initials — never another store's mark.
 */
export function StoreMark({ store, className, size = 40 }: { store: BrandableStore; className?: string; size?: number }) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {store.logo ? (
        <Image src={store.logo.url} alt="" fill sizes={`${size * 2}px`} className="object-contain p-1" />
      ) : (
        <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-ink-500">{storeInitials(store.name)}</span>
      )}
    </span>
  );
}
