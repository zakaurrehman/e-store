import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/forms";
import { Card, dateTime, PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { markStaffNotificationsReadAction } from "@/features/admin/messages";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { cn } from "@/utils/cn";

export const metadata: Metadata = { title: "Notifications" };

async function Notifications() {
  const user = await requireStaff("/admin/notifications");
  const notifications = await db.notification.findMany({ where: { audience: "STAFF", OR: [{ userId: null }, { userId: user.id }] }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = notifications.filter((notification) => !notification.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up"} actions={unread > 0 ? <ActionButton action={markStaffNotificationsReadAction}>Mark all as read</ActionButton> : undefined} />
      <Card padded={false}>
        {notifications.length === 0 ? (
          <p className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">New orders, payment failures, low stock, reviews and messages will appear here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((notification) => {
              const body = (
                <>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", notification.readAt ? "bg-transparent" : "bg-iris-500")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", notification.readAt ? "text-ink-800" : "font-semibold text-ink-950")}>{notification.title}</span>
                    <span className="block text-[0.8125rem] text-ink-600">{notification.body}</span>
                    <span className="block text-[0.75rem] text-ink-400">{dateTime.format(notification.createdAt)}</span>
                  </span>
                </>
              );
              return (
                <li key={notification.id}>
                  {notification.href ? (
                    <Link href={notification.href} className="flex gap-3 px-5 py-3.5 hover:bg-canvas/60">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 px-5 py-3.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Notifications />
    </Suspense>
  );
}
