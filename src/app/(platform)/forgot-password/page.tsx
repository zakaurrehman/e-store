import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/store/auth/auth-forms";
import { AuthShell } from "@/components/store/auth/auth-shell";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter the email address on your account and we'll send you a secure link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-ink-950 underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
