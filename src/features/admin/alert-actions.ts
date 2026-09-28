"use server";

import { z } from "zod";
import { DeliveryStatus, NotificationChannel } from "@/generated/prisma/enums";
import { failure, handleActionError, success, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { sendDeliveries } from "@/server/notifications";
import { webPushKeys } from "@/server/notifications/web-push";
import { getRequestMeta } from "@/server/request";
import { staffAlerts, type StaffAlerts } from "./alerts";

/** The admin panel's heartbeat: its unread badges and the newest customer message, for whoever is looking. */
export async function staffAlertsAction(): Promise<StaffAlerts | null> {
  const user = await getCurrentUser();
  if (!user?.role.isStaff) return null;
  return staffAlerts(user);
}

/** The public key a browser subscribes with (see webPushKeys). */
export async function pushKeyAction(): Promise<{ publicKey: string } | null> {
  try {
    await assertPermission("messages.view");
    return { publicKey: (await webPushKeys()).publicKey };
  } catch {
    return null;
  }
}

/** What a browser's PushSubscription.toJSON() gives: where to send, and the keys to encrypt with. */
const deviceSchema = z.object({
  endpoint: z
    .url()
    .max(2000)
    .refine((value) => value.startsWith("https://"), "not a push service address"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/**
 * Turns alerts on for this device, for the staff member signed in. One row per device: a browser that later
 * signs in as someone else alerts them instead, never both.
 */
export async function savePushDeviceAction(input: unknown): Promise<ActionState> {
  try {
    const user = await assertPermission("messages.view");
    const parsed = deviceSchema.safeParse(input);
    if (!parsed.success) return failure("This browser gave an alert address that can't be used.");
    const { endpoint, keys } = parsed.data;
    const { userAgent } = await getRequestMeta();
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastUsedAt: new Date() },
    });
    return success("Alerts are on for this device.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Turns alerts off for this device. */
export async function removePushDeviceAction(endpoint: string): Promise<ActionState> {
  try {
    const user = await assertPermission("messages.view");
    await db.pushSubscription.deleteMany({ where: { endpoint: String(endpoint).slice(0, 2000), userId: user.id } });
    return success("Alerts are off for this device.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Sends one alert to this device now, and says whether the push service accepted it. */
export async function sendTestPushAction(endpoint: string): Promise<ActionState> {
  try {
    const user = await assertPermission("messages.view");
    const device = await db.pushSubscription.findFirst({ where: { endpoint: String(endpoint).slice(0, 2000), userId: user.id }, select: { id: true } });
    if (!device) return failure("Turn alerts on for this device first.");
    const alert = { title: "Alerts are working", body: "New customer messages will arrive like this. Tap one to open the conversation.", href: "/admin/messages", tag: "push-test" };
    const delivery = await db.notificationDelivery.create({
      data: { channel: NotificationChannel.PUSH, recipient: device.id, template: "staff.push-test", subject: alert.title, payload: alert },
    });
    await sendDeliveries([delivery.id]);
    const sent = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id }, select: { status: true, lastError: true } });
    if (sent.status === DeliveryStatus.SENT) return success("Test alert sent — it should appear on this device in a few seconds.");
    return failure(sent.lastError ? `The test alert couldn't be sent: ${sent.lastError}` : "The test alert couldn't be sent.");
  } catch (error) {
    return handleActionError(error);
  }
}
