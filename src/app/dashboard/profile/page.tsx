import { ChevronRight, ExternalLink, LifeBuoy, LogOut, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/ui";
import { DepositDialog, WithdrawDialog } from "@/components/dashboard/wallet";
import { Skeleton } from "@/components/ui/misc";
import { logoutAction } from "@/features/auth/actions";
import { getStoreSettings } from "@/features/settings/queries";
import { requireStoreOwner } from "@/features/stores/guards";
import { countUnreadOwnerTickets } from "@/features/support/queries";
import { getWalletSummary } from "@/features/wallet/queries";
import { MIN_DEPOSIT_CENTS, MIN_PAYOUT_CENTS } from "@/features/wallet/service";
import { storeUrl } from "@/lib/tenancy";
import { db } from "@/server/db";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Profile" };

/** One row of the profile's short menu: an icon, what it is, and where it goes. */
function Row({ href, icon, label, hint, external }: { href: string; icon: React.ReactNode; label: string; hint?: React.ReactNode; external?: boolean }) {
  const inner = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-800">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium text-ink-950">{label}</span>
        {hint && <span className="block truncate text-[0.8125rem] text-ink-500">{hint}</span>}
      </span>
      {external ? <ExternalLink className="size-4 shrink-0 text-ink-400" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden />}
    </>
  );
  const className = "flex items-center gap-3 px-4 py-3 hover:bg-canvas/60";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

async function Profile() {
  const { user, store } = await requireStoreOwner("/dashboard/profile");
  const [summary, settings, unread, customers] = await Promise.all([
    getWalletSummary(store.id),
    getStoreSettings(),
    countUnreadOwnerTickets(user.id),
    db.contactMessage.count({ where: { storeId: store.id, unreadForStaff: true } }),
  ]);
  const address = storeUrl(store.slug);
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || "?";
  const waiting = unread + customers;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Who and which store */}
      <section className="flex items-center gap-4 rounded-lg border border-line bg-surface p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[0.9375rem] font-semibold text-white" aria-hidden>
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-[-0.01em] text-ink-950">{store.name}</p>
          <p className="truncate text-[0.875rem] text-ink-600">{user.email}</p>
          <a href={address} target="_blank" rel="noopener noreferrer" className="truncate text-[0.8125rem] text-iris-700 hover:underline">
            {address.replace(/^https?:\/\//, "")}
          </a>
        </div>
      </section>

      {/* Money */}
      <section className="rounded-lg border border-line bg-surface p-5" aria-labelledby="profile-balance">
        <p id="profile-balance" className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
          Wallet balance
        </p>
        <p className="tabular mt-1.5 text-3xl font-semibold tracking-[-0.02em] text-ink-950">{formatMoney(summary.availableCents)}</p>
        <p className="mt-1 text-[0.8125rem] text-ink-500">Available to withdraw or spend on fulfilment.</p>
        {summary.pendingCents !== 0 && (
          <p className="mt-2 flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="text-ink-600">Held until delivery</span>
            <span className="tabular font-medium text-warning">{formatMoney(summary.pendingCents)}</span>
          </p>
        )}
        {summary.pendingDepositCount > 0 && (
          <p className="mt-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="text-ink-600">Deposits waiting for confirmation</span>
            <span className="tabular font-medium text-ink-800">{formatMoney(summary.pendingDepositCents)}</span>
          </p>
        )}
        {/* Only the two trigger buttons stretch: the dialogs' own buttons must keep their size. */}
        <div className="mt-4 grid grid-cols-2 gap-2 [&>button]:w-full">
          <DepositDialog minimumCents={MIN_DEPOSIT_CENTS} supportEmail={store.supportEmail} details={settings.deposits} />
          <WithdrawDialog balanceCents={summary.availableCents} minimumCents={MIN_PAYOUT_CENTS} disabled={summary.availableCents < MIN_PAYOUT_CENTS} />
        </div>
        {summary.availableCents < MIN_PAYOUT_CENTS && <p className="mt-2 text-[0.75rem] text-ink-500">Withdrawals start at {formatMoney(MIN_PAYOUT_CENTS)}, paid in USDT (TRC20).</p>}
      </section>

      {/* Where to go next */}
      <nav aria-label="Profile" className="overflow-hidden rounded-lg border border-line bg-surface">
        <ul className="divide-y divide-line">
          <li>
            <Row href="/dashboard/support" icon={<LifeBuoy className="size-4" aria-hidden />} label="Customer service" hint={waiting > 0 ? `${waiting} new` : "Your customers, and your questions to Zendropship"} />
          </li>
          <li>
            <Row href="/dashboard/balance" icon={<Wallet className="size-4" aria-hidden />} label="Balance & history" hint="Every deposit, withdrawal and order payment" />
          </li>
          <li>
            <Row href={address} icon={<ExternalLink className="size-4" aria-hidden />} label="Visit your store" hint={address.replace(/^https?:\/\//, "")} external />
          </li>
          <li>
            <form action={logoutAction}>
              <button type="submit" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas/60">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <LogOut className="size-4" aria-hidden />
                </span>
                <span className="text-[0.9375rem] font-medium text-danger">Sign out</span>
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Your store, your money, and the ways to get help." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Profile />
      </Suspense>
    </>
  );
}
