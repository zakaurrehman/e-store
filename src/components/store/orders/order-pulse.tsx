"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { orderPulseAction } from "@/features/orders/actions";

/**
 * Keeps a customer's tracking page current. Every so often, and whenever the tab comes back into view, it
 * asks the server for the order's fingerprint and, when the order has moved on — accepted, packed, shipped,
 * tracking added — re-renders the page, so the timeline follows the real status without anyone pressing
 * refresh. Checking is a single small read; the page itself is only rebuilt when something changed.
 *
 * `stamp` is what the page was rendered with, so a tab that sat in the background while the order moved
 * still notices on its way back. Polling pauses while the tab is hidden.
 */
export function OrderPulse({ number, token, stamp, intervalMs = 30_000 }: { number: string; token?: string; stamp: string; intervalMs?: number }) {
  const router = useRouter();
  const seen = useRef(stamp);
  const busy = useRef(false);

  // A refresh re-renders the page with a new stamp; that becomes the one to compare against.
  useEffect(() => {
    seen.current = stamp;
  }, [stamp]);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const next = (await orderPulseAction({ number, token })).stamp;
        if (cancelled || !next || next === seen.current) return;
        seen.current = next;
        router.refresh();
      } catch {
        // A missed check is not worth telling anyone about; the next one will do.
      } finally {
        busy.current = false;
      }
    };

    const timer = setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router, number, token, intervalMs]);

  return null;
}
