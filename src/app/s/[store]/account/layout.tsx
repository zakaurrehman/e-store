import { Suspense } from "react";
import { AccountNav } from "@/components/store/account/account-nav";
import { ResendVerificationButton } from "@/components/store/auth/auth-forms";
import { Alert, Skeleton } from "@/components/ui/misc";
import { getCurrentStore } from "@/features/stores/current";
import { countUnreadForCustomer } from "@/features/support/queries";
import { resolveSiteUrl } from "@/lib/site-url";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

async function AccountFrame({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  const store = await getCurrentStore();
  const [unread, unreadSupport] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    countUnreadForCustomer(user.id, store?.id ?? null),
  ]);
  return (
    <div className="container-page pb-20 pt-8 md:pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-500">My account</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.025em] md:text-4xl">
            Hi, {user.firstName}
          </h1>
        </div>
      </div>
      {!user.emailVerified && (
        <Alert tone="info" className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Please confirm your email address ({user.email}) to write reviews and receive order updates.</span>
            <ResendVerificationButton />
          </div>
        </Alert>
      )}
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <AccountNav unread={unread} unreadSupport={unreadSupport} adminUrl={user.role.isStaff ? `${resolveSiteUrl()}/admin` : null} />
        <div className="mt-6 min-w-0 lg:mt-0">{children}</div>
      </div>
    </div>
  );
}

export default function AccountLayout({ children }: LayoutProps<"/s/[store]/account">) {
  return (
    <Suspense
      fallback={
        <div className="container-page pt-10" aria-busy>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="mt-8 h-64" />
        </div>
      }
    >
      <AccountFrame>{children}</AccountFrame>
    </Suspense>
  );
}
