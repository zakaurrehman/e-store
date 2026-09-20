import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/store/auth/auth-forms";
import { AuthShell, AuthSkeleton } from "@/components/store/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function ResetContent({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 20) {
    return (
      <AuthShell title="This link isn't valid" description="Password reset links expire after one hour and can only be used once.">
        <ButtonLink href="/forgot-password" fullWidth size="lg">
          Request a new link
        </ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Choose a new password"
      description="For your security, you'll be signed out on all devices after resetting."
      footer={
        <Link href="/login" className="font-medium text-ink-950 underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}

export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <ResetContent {...props} />
    </Suspense>
  );
}
