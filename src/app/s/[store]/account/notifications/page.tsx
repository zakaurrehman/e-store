import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountSection } from "@/components/store/account/section";
import { MarkAllReadButton } from "@/components/store/account/notifications-client";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { cn } from "@/utils/cn";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

async function Notifications() {
  const user = await requireUser("/account/notifications");
  const notifications = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const unread = notifications.filter((notification) => !notification.readAt).length;
  return (
    <AccountSection title="Notifications" description={unread > 0 ? `${unread} unread` : undefined} action={unread > 0 ? <MarkAllReadButton /> : undefined}>
      {notifications.length === 0 ? (
        <EmptyState icon={<Bell className="size-6" strokeWidth={1.5} />} title="You're all caught up" description="Order updates and account alerts will appear here." className="py-10" />
      ) : (
        <ul className="divide-y divide-line">
          {notifications.map((notification) => {
            const content = (
              <>
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", notification.readAt ? "bg-transparent" : "bg-iris-500")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[0.9375rem]", notification.readAt ? "text-ink-800" : "font-medium text-ink-950")}>{notification.title}</span>
                  <span className="mt-0.5 block text-[0.875rem] text-ink-600">{notification.body}</span>
                  <span className="mt-1 block text-[0.75rem] text-ink-400">{dateFormat.format(notification.createdAt)}</span>
                </span>
              </>
            );
            return (
              <li key={notification.id}>
                {notification.href ? (
                  <Link href={notification.href} className="flex gap-3 py-4 hover:bg-canvas/60 sm:-mx-3 sm:rounded-md sm:px-3">
                    {content}
                  </Link>
                ) : (
                  <div className="flex gap-3 py-4">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AccountSection>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Notifications />
    </Suspense>
  );
}
