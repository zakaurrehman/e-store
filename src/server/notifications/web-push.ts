import "server-only";
import webpush from "web-push";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import type { PushMessage, PushProvider, PushResult } from "./channels";

/**
 * Web Push: alerts on a phone or computer, delivered by the browser's own push service (Google's for
 * Chrome on Android, Apple's for an iPhone home-screen app, Mozilla's for Firefox) even when the site is
 * closed. Each device that turned alerts on is a PushSubscription; the outbox sends to it one delivery at
 * a time, and retries a failed one without ever sending it twice (see sendDeliveries).
 */

const KEY_SETTING = "system.web-push-keys";

export type WebPushKeys = { publicKey: string; privateKey: string };

const isKeys = (value: unknown): value is WebPushKeys =>
  typeof value === "object" && value !== null && typeof (value as WebPushKeys).publicKey === "string" && typeof (value as WebPushKeys).privateKey === "string";

let stored: Promise<WebPushKeys> | null = null;

/**
 * The VAPID key pair push services use to know alerts really come from this site. Set in the environment,
 * or else generated once and kept in the database (never shown in the admin), so alerts work on a fresh
 * deployment without any setup. Every subscription is made against the public key, so it must not change.
 */
export function webPushKeys(): Promise<WebPushKeys> {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return Promise.resolve({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
  stored ??= storedKeys().catch((error: unknown) => {
    stored = null;
    throw error;
  });
  return stored;
}

async function storedKeys(): Promise<WebPushKeys> {
  const existing = await db.setting.findUnique({ where: { key: KEY_SETTING } });
  if (isKeys(existing?.value)) return existing.value;
  const generated = webpush.generateVAPIDKeys();
  try {
    await db.setting.create({ data: { key: KEY_SETTING, value: { publicKey: generated.publicKey, privateKey: generated.privateKey } } });
    return generated;
  } catch (error) {
    // Two requests generated a pair at the same moment: the one that was saved is the one everybody uses.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const saved = await db.setting.findUniqueOrThrow({ where: { key: KEY_SETTING } });
      if (isKeys(saved.value)) return saved.value;
    }
    throw error;
  }
}

/** Who push services should contact about these alerts: a mailto: or https: address. */
function subject() {
  if (env.VAPID_SUBJECT) return env.VAPID_SUBJECT;
  return env.APP_URL.startsWith("https:") ? env.APP_URL : "mailto:push@localhost";
}

/**
 * A push service holds undelivered alerts for a device that is offline; a topic lets a newer alert replace
 * an older one with the same topic, so a phone that was off gets one alert per conversation, not a pile.
 * Topics are at most 32 URL-safe characters.
 */
const topicFor = (tag: string | undefined) => {
  const topic = tag?.replace(/^support-/, "");
  return topic && /^[A-Za-z0-9_-]{1,32}$/.test(topic) ? topic : undefined;
};

/** What the service worker (public/sw.js) receives and shows. */
export type WebPushPayload = { title: string; body: string; href?: string; tag?: string };

export const webPushProvider: PushProvider = {
  name: "web-push",
  async send(message: PushMessage): Promise<PushResult> {
    const device = await db.pushSubscription.findUnique({ where: { id: message.to } });
    if (!device) return { id: null, skipped: "Alerts were turned off on that device" };
    const keys = await webPushKeys();
    const payload: WebPushPayload = { title: message.title, body: message.body, href: message.href, tag: message.tag };
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
        // A message is worth reading for a day; after that the inbox is where it lives.
        TTL: 24 * 60 * 60,
        urgency: "high",
        topic: topicFor(message.tag),
      });
    } catch (error) {
      // The push service no longer knows this device (the browser was reset, or alerts were blocked): forget it.
      if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await db.pushSubscription.deleteMany({ where: { id: device.id } });
        return { id: null, skipped: "The device's subscription has expired" };
      }
      throw error;
    }
    await db.pushSubscription.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
    return { id: null };
  },
};
