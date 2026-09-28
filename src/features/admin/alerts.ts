import "server-only";
import { NotificationAudience } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { db } from "@/server/db";

/** Notification types that are a customer writing in (see staffSupportAlert in server/notifications). */
export const SUPPORT_ALERT_TYPES = ["contact.received", "support.customer-replied"];

/** A customer message staff have not seen yet — what the admin panel shows as an alert with a link. */
export type IncomingAlert = { id: string; title: string; body: string; href: string };

export type StaffAlerts = {
  /** Unread admin notifications (the Notifications page). */
  notifications: number;
  /** Conversations with something unread (the Support inbox) — 0 for staff who can't see the inbox. */
  support: number;
  /** The newest unread customer-message alert, so the panel can announce it once. */
  latest: IncomingAlert | null;
};

type StaffUser = { id: string; permissions: string[] };

const staffNotifications = (user: StaffUser) => ({ audience: NotificationAudience.STAFF, readAt: null, OR: [{ userId: null }, { userId: user.id }] });

/** What the admin panel's badges and alert show for one staff member. Three small reads. */
export async function staffAlerts(user: StaffUser): Promise<StaffAlerts> {
  const inbox = hasPermission(user.permissions, "messages.view");
  const [notifications, support, latest] = await Promise.all([
    db.notification.count({ where: staffNotifications(user) }),
    inbox ? db.contactMessage.count({ where: { unreadForStaff: true } }) : 0,
    inbox
      ? db.notification.findFirst({
          where: { ...staffNotifications(user), type: { in: SUPPORT_ALERT_TYPES }, href: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, body: true, href: true },
        })
      : null,
  ]);
  return { notifications, support, latest: latest?.href ? { id: latest.id, title: latest.title, body: latest.body, href: latest.href } : null };
}

/**
 * A conversation has been opened in the admin: its alerts are read. Matches the link each alert carries —
 * today's (`/admin/messages?id=…`) and the one older alerts were given (`/admin/messages/…`).
 */
export async function markConversationAlertsRead(conversationId: string) {
  const id = String(conversationId).slice(0, 40);
  await db.notification.updateMany({
    where: { audience: NotificationAudience.STAFF, readAt: null, type: { in: SUPPORT_ALERT_TYPES }, href: { in: [`/admin/messages?id=${id}`, `/admin/messages/${id}`] } },
    data: { readAt: new Date() },
  });
}
