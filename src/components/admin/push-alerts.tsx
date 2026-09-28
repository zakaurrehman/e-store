"use client";

import { BellOff, BellRing, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { pushKeyAction, removePushDeviceAction, savePushDeviceAction, sendTestPushAction } from "@/features/admin/alert-actions";
import { cn } from "@/utils/cn";

/**
 * Alerts on this device: a staff member's phone (or computer) shows a notification whenever a customer writes
 * in, even with the admin panel closed. Turning them on asks the browser's permission, registers the alert
 * worker (public/sw.js) for the admin panel, and gives the server this device's push address.
 *
 * iPhones and iPads only allow alerts for web apps on the Home Screen (iOS 16.4 and later), so there the
 * first step is adding the admin panel to the Home Screen.
 */

type DeviceState = "checking" | "unsupported" | "install" | "blocked" | "off" | "on";

const WORKER = "/sw.js";
const SCOPE = "/admin";
/** Remembered per device so the panel does not also announce, on screen, what the phone already alerted. */
export const PUSH_FLAG = "zendropship-admin-alerts";

function remember(on: boolean) {
  try {
    localStorage.setItem(PUSH_FLAG, on ? "on" : "off");
  } catch {
    // Private mode: the panel shows its own alerts as well, which is harmless.
  }
}

function base64UrlToBytes(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = base64UrlToBytes(publicKey);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

const isAppleMobile = () => /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration(SCOPE);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function PushAlerts({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Where this device stands. A device that is on is re-announced to the server each time, so a browser
  // whose push address changed, or a server whose keys changed, is brought back in line without a click.
  useEffect(() => {
    let cancelled = false;
    const settle = (next: DeviceState) => {
      if (!cancelled) setState(next);
    };
    (async () => {
      if (!canPush()) return settle(isAppleMobile() && !isInstalled() ? "install" : "unsupported");
      if (Notification.permission === "denied") return settle("blocked");
      const subscription = await currentSubscription();
      if (!subscription || Notification.permission !== "granted") {
        remember(false);
        return settle("off");
      }
      const key = await pushKeyAction();
      if (key && !sameKey(subscription, key.publicKey)) {
        await subscription.unsubscribe();
        remember(false);
        return settle("off");
      }
      const saved = await savePushDeviceAction(subscription.toJSON());
      remember(saved.status === "success");
      settle(saved.status === "success" ? "on" : "off");
    })().catch(() => settle("off"));
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    setMessage(null);
    // Asked straight from the tap: iPhones only show the permission prompt in direct response to one.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "blocked" : "off");
      return;
    }
    setBusy(true);
    try {
      const key = await pushKeyAction();
      if (!key) throw new Error("Only staff who can read the support inbox can turn alerts on.");
      const registration = await navigator.serviceWorker.register(WORKER, { scope: SCOPE, updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing && !sameKey(existing, key.publicKey)) await existing.unsubscribe();
      const subscription = (existing && sameKey(existing, key.publicKey) ? existing : null) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key.publicKey) }));
      const saved = await savePushDeviceAction(subscription.toJSON());
      if (saved.status !== "success") throw new Error(saved.status === "error" ? saved.message : "Alerts could not be turned on.");
      remember(true);
      setState("on");
      setMessage({ tone: "ok", text: "Alerts are on. Send a test to see one arrive." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error && error.message ? `Alerts could not be turned on: ${error.message}` : "Alerts could not be turned on." });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await removePushDeviceAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      remember(false);
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const subscription = await currentSubscription();
      const result = subscription ? await sendTestPushAction(subscription.endpoint) : null;
      if (result?.status === "success") setMessage({ tone: "ok", text: result.message ?? "Test alert sent." });
      else setMessage({ tone: "error", text: result?.status === "error" ? result.message : "Turn alerts on first." });
    } finally {
      setBusy(false);
    }
  };

  if (state === "checking") return null;
  // In the inbox, only a device that could have alerts and does not gets a prompt.
  if (compact && (state === "on" || state === "unsupported")) return null;

  const copy: Record<Exclude<DeviceState, "checking">, string> = {
    on: "This device shows an alert whenever a customer writes in — even when the admin panel is closed. Tap the alert to open the conversation.",
    off: "Get an alert on this device whenever a customer writes in, even when the admin panel is closed.",
    install: "On iPhone and iPad, alerts work from the Home Screen: tap Share, then Add to Home Screen, open Zendropship Admin from your Home Screen and turn alerts on there.",
    blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back to turn alerts on.",
    unsupported: "This browser can't show alerts. New messages still appear here, with a count on Support inbox.",
  };

  return (
    <section
      aria-label="Alerts on this device"
      className={cn("rounded-lg border bg-surface", compact ? "mb-4 flex flex-wrap items-center gap-3 border-iris-100 px-4 py-3" : "border-line p-5")}
    >
      <div className={cn("flex min-w-0 flex-1 gap-3", !compact && "items-start")}>
        {state === "on" ? (
          <BellRing className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
        ) : state === "install" ? (
          <Share className="mt-0.5 size-5 shrink-0 text-iris-600" strokeWidth={1.75} aria-hidden />
        ) : (
          <BellOff className="mt-0.5 size-5 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-950">{state === "on" ? "Alerts are on for this device" : "Alerts on this device"}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-600">{copy[state]}</p>
          {message && (
            <p role="status" className={cn("mt-1.5 text-[0.8125rem]", message.tone === "ok" ? "text-success" : "text-danger")}>
              {message.text}
            </p>
          )}
        </div>
      </div>
      {(state === "off" || state === "on") && (
        <div className={cn("flex flex-wrap gap-2", !compact && "mt-4")}>
          {state === "off" ? (
            <Button size="sm" onClick={turnOn} loading={busy}>
              Turn on alerts
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={sendTest} loading={busy}>
                Send a test alert
              </Button>
              <Button size="sm" variant="ghost" onClick={turnOff} disabled={busy}>
                Turn off
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
