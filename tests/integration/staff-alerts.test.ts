import { createECDH, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import webpush from "web-push";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markConversationAlertsRead, staffAlerts } from "@/features/admin/alerts";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { addReply, openConversation } from "@/features/support/service";
import { DeliveryStatus, NotificationChannel } from "@/generated/prisma/enums";
import { DEMO_STORE_SLUG } from "@/lib/tenancy";
import { db } from "@/server/db";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";
import { registerPushProvider, type PushMessage, type PushProvider } from "@/server/notifications/channels";
import { webPushKeys, webPushProvider } from "@/server/notifications/web-push";
import { invitation } from "./helpers";

// http_ece is what web-push encrypts with; here it plays the phone, decrypting what arrives.
const ece = createRequire(import.meta.url)("http_ece") as { decrypt: (buffer: Buffer, params: Record<string, unknown>) => Buffer };

let sequence = 0;
const unique = (label: string) => `${label}.${Date.now()}.${(sequence += 1)}@example.com`;

async function userWithRole(roleKey: string, firstName: string) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  return db.user.create({ data: { email: unique(firstName.toLowerCase()), firstName, lastName: "Tester", roleId: role.id } });
}

/** A staff role that can see the dashboard but not the support inbox. */
async function viewerWithoutInbox() {
  const permission = await db.permission.findUniqueOrThrow({ where: { key: "dashboard.view" } });
  const role = await db.role.upsert({
    where: { key: "ALERTS_TEST_VIEWER" },
    create: { key: "ALERTS_TEST_VIEWER", name: "Dashboard only", isStaff: true, rank: 5, permissions: { create: [{ permissionId: permission.id }] } },
    update: {},
  });
  return db.user.create({ data: { email: unique("viewer"), firstName: "Vera", lastName: "Viewer", roleId: role.id } });
}

/** A device that turned alerts on — with real browser-style keys, so what is sent to it can be decrypted. */
async function device(userId: string) {
  const browser = createECDH("prime256v1");
  browser.generateKeys();
  const auth = randomBytes(16);
  const row = await db.pushSubscription.create({
    data: {
      userId,
      endpoint: `https://push.example.test/send/${randomBytes(12).toString("hex")}`,
      p256dh: browser.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    },
  });
  return { row, browser, auth };
}

/** Records what would have gone to each device, and can answer as a push service that forgot a device. */
function recordingPush(answer: (message: PushMessage) => { skipped?: string } = () => ({})) {
  const sent: PushMessage[] = [];
  const provider: PushProvider = {
    name: "recording",
    async send(message) {
      sent.push(message);
      return { id: `push-${sent.length}`, ...answer(message) };
    },
  };
  registerPushProvider(provider);
  return sent;
}

const pushesFor = (ids: string[]) => db.notificationDelivery.findMany({ where: { id: { in: ids }, channel: NotificationChannel.PUSH } });

async function storeWithOwner() {
  return openStoreForNewOwner({ storeName: `Alerts Store ${(sequence += 1)}`, firstName: "Olga", lastName: "Owner", email: unique("owner"), password: "Correct-horse-battery-7", referralCode: await invitation() });
}

afterEach(async () => {
  registerPushProvider(null);
  vi.restoreAllMocks();
  // Other suites dispatch support events too; they should find no devices left behind.
  await db.pushSubscription.deleteMany();
});

describe("alerts to staff about customer messages", () => {
  it("a new message reaches staff once: one admin notification that opens the conversation, and one alert per device that turned alerts on", async () => {
    const admin = await userWithRole("SUPER_ADMIN", "Ada");
    const manager = await userWithRole("MANAGER", "Milo");
    const viewer = await viewerWithoutInbox();
    const shopper = await userWithRole("CUSTOMER", "Cora");
    const [phone, laptop, managerPhone, viewerPhone, shopperPhone] = await Promise.all([device(admin.id), device(admin.id), device(manager.id), device(viewer.id), device(shopper.id)]);

    const conversation = await openConversation({ storeId: null, name: "Cora Customer", email: shopper.email, subject: "Where is my parcel?", message: "Ordered   last week —\nstill nothing." });
    const ids = await dispatchNotification({ type: "contact.received", messageId: conversation.id });

    // One notification in the admin, which opens this conversation (it used to link to a page that doesn't exist).
    const notifications = await db.notification.findMany({ where: { audience: "STAFF", type: "contact.received", href: { contains: conversation.id } } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].href).toBe(`/admin/messages?id=${conversation.id}`);
    expect(notifications[0].title).toBe("New message from Cora Customer");

    // An alert for every device of staff who can read the inbox — nobody else's.
    const pushes = await pushesFor(ids);
    expect(pushes.map((push) => push.recipient).sort()).toEqual([phone.row.id, laptop.row.id, managerPhone.row.id].sort());
    expect(pushes.map((push) => push.recipient)).not.toContain(viewerPhone.row.id);
    expect(pushes.map((push) => push.recipient)).not.toContain(shopperPhone.row.id);
    expect(pushes[0].payload).toEqual({
      title: "New message from Cora Customer · Zendropship",
      body: "Where is my parcel? — Ordered last week — still nothing.",
      href: `/admin/messages?id=${conversation.id}`,
      tag: `support-${conversation.id}`,
    });

    // Sent once. Sending the same deliveries again — a retry, a second worker — sends nothing more.
    const sent = recordingPush();
    await sendDeliveries(ids);
    await sendDeliveries(ids);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((message) => message.to)).size).toBe(3);
    expect(sent.every((message) => message.tag === `support-${conversation.id}` && message.href === `/admin/messages?id=${conversation.id}`)).toBe(true);
    expect((await pushesFor(ids)).every((push) => push.status === DeliveryStatus.SENT)).toBe(true);
  });

  it("a message in an owner's store tells the owner and alerts staff; a reply in Zendropship's own store reaches staff", async () => {
    const admin = await userWithRole("SUPER_ADMIN", "Abe");
    const phone = await device(admin.id);
    const { user: owner, store } = await storeWithOwner();

    const inStore = await openConversation({ storeId: store.id, name: "Dina", email: unique("dina"), subject: "Sizes", message: "Does it run small?" });
    const ids = await dispatchNotification({ type: "contact.received", messageId: inStore.id });
    const told = await db.notification.findMany({ where: { href: { contains: inStore.id } }, orderBy: { audience: "asc" } });
    expect(told.map((row) => [row.audience, row.userId])).toEqual(
      expect.arrayContaining([
        ["CUSTOMER", owner.id],
        ["STAFF", null],
      ]),
    );
    expect(told.find((row) => row.audience === "STAFF")?.body).toBe(`Sizes · ${store.name}`);
    expect((await pushesFor(ids)).map((push) => push.recipient)).toEqual([phone.row.id]);

    // Zendropship's own store has no owner: a customer writing back there is staff's to answer — and they hear
    // about it (before, nobody did).
    const demo = await db.store.findUniqueOrThrow({ where: { slug: DEMO_STORE_SLUG } });
    const thread = await openConversation({ storeId: demo.id, name: "Eli", email: unique("eli"), subject: "Returns", message: "How do I send it back?" });
    const { reply } = await addReply(thread.id, "Also — can I exchange instead?", { kind: "customer", userId: null });
    const replyIds = await dispatchNotification({ type: "support.customer-replied", messageId: thread.id, replyId: reply.id });
    expect(await db.notification.count({ where: { audience: "STAFF", type: "support.customer-replied", href: `/admin/messages?id=${thread.id}` } })).toBe(1);
    const [alert] = await pushesFor(replyIds);
    expect(alert.recipient).toBe(phone.row.id);
    expect(alert.payload).toMatchObject({ title: `New reply from Eli · ${demo.name}`, body: "Returns — Also — can I exchange instead?" });
  });

  it("counts what is unread for the admin's badges, announces the newest message, and reads a conversation's alerts when it is opened", async () => {
    const admin = await userWithRole("SUPER_ADMIN", "Ana");
    const viewer = await viewerWithoutInbox();
    const first = await openConversation({ storeId: null, name: "Finn", email: unique("finn"), subject: "First", message: "Hello there." });
    await dispatchNotification({ type: "contact.received", messageId: first.id });
    const second = await openConversation({ storeId: null, name: "Gus", email: unique("gus"), subject: "Second", message: "Hi again." });
    await dispatchNotification({ type: "contact.received", messageId: second.id });
    // An alert from before this change, carrying the old link, is found by the same conversation.
    await db.notification.create({ data: { audience: "STAFF", type: "contact.received", title: "Message from Finn", body: "First", href: `/admin/messages/${first.id}`, createdAt: new Date(Date.now() - 60_000) } });

    const before = await staffAlerts({ id: admin.id, permissions: (await db.permission.findMany({ select: { key: true } })).map((row) => row.key) });
    expect(before.support).toBe(await db.contactMessage.count({ where: { unreadForStaff: true } }));
    expect(before.support).toBeGreaterThanOrEqual(2);
    expect(before.latest).toMatchObject({ title: "New message from Gus", href: `/admin/messages?id=${second.id}` });

    // Staff who can't read the inbox are not told about it.
    const blind = await staffAlerts({ id: viewer.id, permissions: ["dashboard.view"] });
    expect(blind.support).toBe(0);
    expect(blind.latest).toBeNull();

    // Opening the second conversation reads its alert; the first is still waiting — both of its alerts.
    await markConversationAlertsRead(second.id);
    const unreadFor = (id: string) => db.notification.count({ where: { audience: "STAFF", readAt: null, href: { in: [`/admin/messages?id=${id}`, `/admin/messages/${id}`] } } });
    expect(await unreadFor(second.id)).toBe(0);
    expect(await unreadFor(first.id)).toBe(2);
    const after = await staffAlerts({ id: admin.id, permissions: ["messages.view"] });
    expect(after.latest?.href).toBe(`/admin/messages?id=${first.id}`);
    expect(after.notifications).toBe(before.notifications - 1);

    await markConversationAlertsRead(first.id);
    expect(await unreadFor(first.id)).toBe(0);
  });
});

describe("delivering alerts with Web Push", () => {
  it("encrypts each alert so that only the device it is for can read it", async () => {
    const keys = await webPushKeys();
    // Generated once and kept: every subscription is made against this key, so it must not change.
    expect(await webPushKeys()).toEqual(keys);
    expect(await db.setting.findUnique({ where: { key: "system.web-push-keys" } })).not.toBeNull();

    const admin = await userWithRole("SUPER_ADMIN", "Cleo");
    const { row, browser, auth } = await device(admin.id);
    const payload = JSON.stringify({ title: "New message from Hana · Zendropship", body: "Refund — Please help.", href: "/admin/messages?id=abc", tag: "support-abc" });
    const request = webpush.generateRequestDetails({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
      vapidDetails: { subject: "mailto:push@example.com", publicKey: keys.publicKey, privateKey: keys.privateKey },
    });
    expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(String(request.headers.Authorization)).toMatch(/^vapid t=.+, k=/);
    expect(ece.decrypt(request.body as Buffer, { version: "aes128gcm", privateKey: browser, authSecret: auth }).toString()).toBe(payload);

    const stranger = createECDH("prime256v1");
    stranger.generateKeys();
    expect(() => ece.decrypt(request.body as Buffer, { version: "aes128gcm", privateKey: stranger, authSecret: auth })).toThrow();
  });

  it("sends through the push service with the conversation as its topic, and forgets a device the service no longer knows", async () => {
    const admin = await userWithRole("SUPER_ADMIN", "Dev");
    const kept = await device(admin.id);
    const gone = await device(admin.id);
    const send = vi.spyOn(webpush, "sendNotification").mockImplementation(async (subscription) => {
      if (subscription.endpoint === gone.row.endpoint) throw new webpush.WebPushError("Gone", 410, {}, "", subscription.endpoint);
      return { statusCode: 201, body: "", headers: {} };
    });

    const delivered = await webPushProvider.send({ to: kept.row.id, title: "New message", body: "Hello", href: "/admin/messages?id=c1", tag: "support-cm1abcdefghijklmnopqrstuv" });
    expect(delivered.skipped).toBeUndefined();
    const [subscription, body, options] = send.mock.calls[0];
    expect(subscription).toEqual({ endpoint: kept.row.endpoint, keys: { p256dh: kept.row.p256dh, auth: kept.row.auth } });
    expect(JSON.parse(String(body))).toEqual({ title: "New message", body: "Hello", href: "/admin/messages?id=c1", tag: "support-cm1abcdefghijklmnopqrstuv" });
    // A phone that was off gets the latest alert per conversation, not a pile of them.
    expect(options).toMatchObject({ topic: "cm1abcdefghijklmnopqrstuv", TTL: 86400, urgency: "high" });
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { id: kept.row.id } })).lastUsedAt.getTime()).toBeGreaterThan(kept.row.lastUsedAt.getTime() - 1);

    expect((await webPushProvider.send({ to: gone.row.id, title: "New message", body: "Hello" })).skipped).toMatch(/expired/);
    expect(await db.pushSubscription.findUnique({ where: { id: gone.row.id } })).toBeNull();
    // A delivery to a device that is gone is recorded as skipped, and never retried.
    const delivery = await db.notificationDelivery.create({ data: { channel: NotificationChannel.PUSH, recipient: gone.row.id, template: "test", subject: "t", payload: { title: "t", body: "b" } } });
    await sendDeliveries([delivery.id]);
    const after = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(after.status).toBe(DeliveryStatus.SKIPPED);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
