import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangePasswordForm, SignOutOtherSessions } from "@/components/store/account/profile-forms";
import { AccountSection } from "@/components/store/account/section";
import { Skeleton } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Password & security", robots: { index: false } };

async function Security() {
  const user = await requireUser("/account/security");
  const otherSessions = await db.session.count({ where: { userId: user.id, id: { not: user.sessionId }, expiresAt: { gt: new Date() } } });
  return (
    <div className="space-y-12">
      <AccountSection title="Change password" description="Changing your password signs you out everywhere else.">
        <ChangePasswordForm />
      </AccountSection>
      <AccountSection title="Devices" description="Sessions expire automatically after 30 days.">
        <SignOutOtherSessions count={otherSessions} />
      </AccountSection>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Security />
    </Suspense>
  );
}
