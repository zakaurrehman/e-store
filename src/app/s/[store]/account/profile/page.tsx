import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileForm } from "@/components/store/account/profile-forms";
import { AccountSection } from "@/components/store/account/section";
import { Skeleton } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

async function Profile() {
  const user = await requireUser("/account/profile");
  const profile = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { firstName: true, lastName: true, email: true, phone: true, marketingOptIn: true } });
  return (
    <AccountSection title="Profile" description="Your details and communication preferences.">
      <ProfileForm profile={profile} />
    </AccountSection>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Profile />
    </Suspense>
  );
}
