"use client";

import { MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { staffAlertsAction } from "@/features/admin/alert-actions";
import type { IncomingAlert, StaffAlerts } from "@/features/admin/alerts";
import { PUSH_FLAG } from "./push-alerts";

const CHECK_EVERY_MS = 20_000;

function alertsOnThisDevice() {
  try {
    return localStorage.getItem(PUSH_FLAG) === "on" && "Notification" in window && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/**
 * Keeps the admin panel's unread badges current, and announces a customer message that arrives while the
 * panel is open. It checks every 20 seconds while the tab is in view, the moment it comes back into view,
 * after every page change (opening a conversation reads it), and as soon as an alert reaches this device.
 *
 * Each message is announced once. A message that was already waiting when the panel opened is counted, not
 * announced; one that is open on screen is not announced at all; and on a device with alerts turned on the
 * phone's own alert is the announcement, so the panel does not repeat it.
 */
export function useStaffAlerts(initial: StaffAlerts) {
  const [alerts, setAlerts] = useState(initial);
  const [incoming, setIncoming] = useState<IncomingAlert | null>(null);
  const announced = useRef(new Set(initial.latest ? [initial.latest.id] : []));
  const busy = useRef(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const here = `${pathname}${search ? `?${search}` : ""}`;
  const hereRef = useRef(here);

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const next = await staffAlertsAction();
      if (!next) return;
      setAlerts(next);
      const latest = next.latest;
      if (latest && !announced.current.has(latest.id)) {
        announced.current.add(latest.id);
        if (latest.href !== hereRef.current && !alertsOnThisDevice()) setIncoming(latest);
      }
      // Read meanwhile — here or by someone else: nothing is left to announce.
      if (!latest) setIncoming(null);
    } catch {
      // A missed check is not worth reporting; the next one will do.
    } finally {
      busy.current = false;
    }
  }, []);

  // Every page change: the page may have just read a conversation. Checked once it has settled.
  useEffect(() => {
    hereRef.current = here;
    const timer = window.setTimeout(check, 250);
    return () => window.clearTimeout(timer);
  }, [here, check]);

  useEffect(() => {
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  // The alert worker tells open pages when an alert arrives, and asks them to open one that was tapped.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; href?: string } | null;
      if (data?.type === "staff-alert") void check();
      if (data?.type === "staff-alert-open" && typeof data.href === "string" && data.href.startsWith("/admin")) router.push(data.href);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [check, router]);

  // Opening the conversation it announces answers it.
  return { alerts, incoming: incoming && incoming.href !== here ? incoming : null, dismiss: () => setIncoming(null) };
}

/** A customer message that just arrived: who, about what, and the way to it. */
export function IncomingMessage({ alert, onDismiss }: { alert: IncomingAlert; onDismiss: () => void }) {
  return (
    <div role="alert" className="fixed inset-x-3 top-16 z-[60] mx-auto max-w-md animate-rise-in rounded-lg bg-ink-950 text-white shadow-pop sm:left-auto sm:right-6 sm:top-6 sm:mx-0 sm:w-96 lg:top-4">
      <div className="flex items-start gap-3 p-4">
        <MessageSquare className="mt-0.5 size-5 shrink-0 text-iris-100" strokeWidth={1.75} aria-hidden />
        <Link href={alert.href} onClick={onDismiss} className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{alert.title}</span>
          <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-300">{alert.body}</span>
          <span className="mt-2 inline-block text-[0.8125rem] font-medium underline underline-offset-4">Open conversation</span>
        </Link>
        <button type="button" onClick={onDismiss} className="-mr-1 -mt-1 rounded-xs p-1.5 text-ink-400 hover:text-white" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * On a page showing one conversation: alerts about it that are still in the phone's notification tray are
 * cleared, since it has now been read.
 */
export function ClearConversationAlerts({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration("/admin").then((registration) => {
      registration?.active?.postMessage({ type: "clear-alerts", tag: `support-${conversationId}` });
    });
  }, [conversationId]);
  return null;
}
