import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RegisterForm } from "@/components/store/auth/auth-forms";
import { AuthShell, AuthSkeleton } from "@/components/store/auth/auth-shell";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };

async function RegisterContent({ searchParams }: PageProps<"/register">) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : undefined;
  if (await getCurrentUser()) redirect("/account");
  return (
    <AuthShell
      title="Create your account"
      description="Track orders, save addresses and your wishlist, and review what you buy."
      footer={
        <>
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-ink-950 underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}

export default function RegisterPage(props: PageProps<"/register">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <RegisterContent {...props} />
    </Suspense>
  );
}
