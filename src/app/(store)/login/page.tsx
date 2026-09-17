import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/store/auth/auth-forms";
import { AuthShell, AuthSkeleton } from "@/components/store/auth/auth-shell";
import { safeRedirectPath } from "@/features/auth/schemas";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

async function LoginContent({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : undefined;
  const user = await getCurrentUser();
  if (user) redirect(safeRedirectPath(next, user.role.isStaff ? "/admin" : "/account"));
  const notice = query.reset === "1" ? "Your password has been updated. Sign in with your new password." : undefined;
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to track orders, save your details and check out faster."
      footer={
        <>
          New to Zendropship?{" "}
          <Link href={registerHref} className="font-medium text-ink-950 underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={notice} />
    </AuthShell>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <LoginContent {...props} />
    </Suspense>
  );
}
