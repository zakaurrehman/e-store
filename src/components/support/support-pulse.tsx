"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { supportPulseAction } from "@/features/support/actions";

/**
 * Keeps an open conversation current. It asks the server every few seconds whether anything the viewer
 * can see has changed and, when it has, re-renders the page — so a reply lands in the thread, and the
 * unread badges follow, without anyone pressing refresh.
 *
 * `stamp` is what the page was rendered with. Comparing against it, rather than against the first answer
 * the heartbeat gets, matters: a tab that was in the background when the reply arrived would otherwise take
 * the new state as its starting point and never show it. Polling stops while the tab is hidden and checks
 * once on the way back.
 */
export function SupportPulse({ stamp, intervalMs = 5000 }: { stamp: string; intervalMs?: number }) {
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
        const next = (await supportPulseAction()).stamp;
        if (cancelled || next === seen.current) return;
        seen.current = next;
        router.refresh();
      } catch {
        // A failed heartbeat is not worth telling anyone about; the next one will do.
      } finally {
        busy.current = false;
      }
    };

    const timer = setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router, intervalMs]);

  return null;
}
