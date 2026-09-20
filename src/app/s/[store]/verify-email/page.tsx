import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, AuthSkeleton } from "@/components/store/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { verifyEmailToken } from "@/features/auth/service";
import { isDomainError } from "@/server/errors";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function VerifyContent({ searchParams }: PageProps<"/s/[store]/verify-email">) {
  const { token } = await searchParams;
  let message: string | null = null;
  if (typeof token !== "string" || token.length < 20) {
    message = "This confirmation link is incomplete.";
  } else {
    try {
      await verifyEmailToken(token);
    } catch (error) {
      if (!isDomainError(error)) throw error;
      message = error.message;
    }
  }

  if (message) {
    return (
      <AuthShell title="We couldn't confirm your email" description={message}>
        <XCircle className="mb-6 size-10 text-danger" strokeWidth={1.5} aria-hidden />
        <ButtonLink href="/account" fullWidth size="lg">
          Go to your account to resend
        </ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Email confirmed" description="Thanks — your email address is confirmed. You can now write reviews and receive order updates.">
      <CheckCircle2 className="mb-6 size-10 text-success" strokeWidth={1.5} aria-hidden />
      <ButtonLink href="/account" fullWidth size="lg">
        Continue to your account
      </ButtonLink>
    </AuthShell>
  );
}

export default function VerifyEmailPage(props: PageProps<"/s/[store]/verify-email">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <VerifyContent {...props} />
    </Suspense>
  );
}
