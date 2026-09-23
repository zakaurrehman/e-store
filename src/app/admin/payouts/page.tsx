import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/forms";
import { MarkPaid } from "@/components/admin/payouts/mark-paid";
import { Card, dateTime, PageHeader, StatTile, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { CopyValue } from "@/components/ui/copy-value";
import { Skeleton } from "@/components/ui/misc";
import { rejectPayoutAction, setPayoutStatusAction } from "@/features/wallet/actions";
import { DepositStatus, PayoutStatus } from "@/generated/prisma/enums";
import { payoutMethodLabel, tronscanTransactionUrl } from "@/lib/money-methods";
import { looksLikeTrc20TxId } from "@/lib/tron";
import { can, requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Withdrawals" };

const PAYOUT_LABELS: Record<PayoutStatus, string> = { REQUESTED: "Requested", APPROVED: "Approved", PROCESSING: "Being sent", PAID: "Paid", REJECTED: "Declined" };
const PAYOUT_TONES: Record<PayoutStatus, "warning" | "success" | "danger"> = { REQUESTED: "warning", APPROVED: "warning", PROCESSING: "warning", PAID: "success", REJECTED: "danger" };

async function Payouts() {
  const user = await requirePagePermission("stores.view", "/admin/payouts");
  const canManage = can(user, "stores.manage");
  const [payouts, pendingDeposits, owed] = await Promise.all([
    db.payout.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { store: { select: { name: true, slug: true } }, requestedBy: { select: { email: true } } } }),
    db.deposit.findMany({ where: { status: DepositStatus.PENDING }, orderBy: { createdAt: "desc" }, select: { id: true, amountCents: true } }),
    db.walletEntry.aggregate({ _sum: { amountCents: true } }),
  ]);
  const open: PayoutStatus[] = [PayoutStatus.REQUESTED, PayoutStatus.APPROVED, PayoutStatus.PROCESSING];
  const requested = payouts.filter((payout) => open.includes(payout.status));

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Owed to owners" value={formatMoney(owed._sum.amountCents ?? 0)} hint="Total of every store balance" />
        <StatTile label="Withdrawals to send" value={requested.length} hint={formatMoney(requested.reduce((sum, payout) => sum + payout.amountCents, 0))} tone={requested.length ? "warning" : "default"} />
        <StatTile label="Deposits to review" value={pendingDeposits.length} hint={formatMoney(pendingDeposits.reduce((sum, deposit) => sum + deposit.amountCents, 0))} tone={pendingDeposits.length ? "warning" : "default"} href="/admin/deposits?status=PENDING" />
      </div>

      <Card title="Withdrawals" description="Send the money, then mark it paid. Declining returns the amount to the owner's balance." padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Requested</Th>
              <Th>Store</Th>
              <Th className="text-right">Amount</Th>
              <Th>Send to</Th>
              <Th>Status</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 && <TableEmpty colSpan={canManage ? 6 : 5}>No withdrawals yet.</TableEmpty>}
            {payouts.map((payout) => (
              <tr key={payout.id}>
                <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">{dateTime.format(payout.createdAt)}</Td>
                <Td className="max-w-[13rem]">
                  <Link href={`/admin/stores?q=${payout.store.slug}`} className="block truncate font-medium text-ink-950 hover:underline">
                    {payout.store.name}
                  </Link>
                  {payout.requestedBy && <p className="truncate text-[0.75rem] text-ink-500">{payout.requestedBy.email}</p>}
                </Td>
                <Td className="tabular text-right font-medium">{formatMoney(payout.amountCents)}</Td>
                <Td className="max-w-[13rem]">
                  <p className="text-[0.8125rem] text-ink-800">{payoutMethodLabel(payout.method)}</p>
                  {payout.method === "USDT_TRC20" ? (
                    <CopyValue value={payout.destination} label="TRC20 address" className="mt-0.5" />
                  ) : (
                    <p className="line-clamp-2 break-words text-[0.8125rem] text-ink-600" title={payout.destination}>
                      {payout.destination}
                    </p>
                  )}
                  {payout.note && <p className="mt-1 line-clamp-1 text-[0.75rem] text-ink-500">{payout.note}</p>}
                </Td>
                <Td>
                  <StatusBadge label={PAYOUT_LABELS[payout.status]} tone={PAYOUT_TONES[payout.status]} />
                  {payout.reference &&
                    (payout.method === "USDT_TRC20" && looksLikeTrc20TxId(payout.reference) ? (
                      <a
                        href={tronscanTransactionUrl(payout.reference)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block max-w-[10rem] truncate font-mono text-[0.75rem] text-ink-600 underline underline-offset-2 hover:text-ink-950"
                        title="Open this transaction on Tronscan"
                      >
                        {payout.reference}
                      </a>
                    ) : (
                      <p className="mt-1 text-[0.75rem] text-ink-500">{payout.reference}</p>
                    ))}
                </Td>
                {canManage && (
                  <Td className="whitespace-nowrap text-right">
                    {open.includes(payout.status) && (
                      <span className="flex justify-end gap-2">
                        {payout.status === PayoutStatus.REQUESTED && (
                          <ActionButton action={setPayoutStatusAction.bind(null, payout.id, "APPROVED")} size="xs" variant="ghost">
                            Approve
                          </ActionButton>
                        )}
                        {payout.status === PayoutStatus.APPROVED && (
                          <ActionButton action={setPayoutStatusAction.bind(null, payout.id, "PROCESSING")} size="xs" variant="ghost">
                            Sending
                          </ActionButton>
                        )}
                        <MarkPaid payoutId={payout.id} amountCents={payout.amountCents} method={payout.method} destination={payout.destination} />
                        <ActionButton
                          action={rejectPayoutAction.bind(null, payout.id, "Declined by Zendropship")}
                          size="xs"
                          variant="ghost"
                          confirm={{ title: "Decline this withdrawal?", description: "The amount goes back to the owner's balance.", confirmLabel: "Decline", destructive: true }}
                        >
                          Decline
                        </ActionButton>
                      </span>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card
        className="mt-6"
        title="Deposits"
        description="Transfers owners say they have sent are reviewed on their own screen, with the proof beside the figures."
        actions={
          <Link href="/admin/deposits" className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-3.5 text-[0.875rem] font-medium hover:border-ink-950">
            Open deposit requests
          </Link>
        }
      >
        <p className="text-[0.9375rem] text-ink-600">
          {pendingDeposits.length > 0
            ? `${pendingDeposits.length} deposit${pendingDeposits.length === 1 ? "" : "s"} worth ${formatMoney(pendingDeposits.reduce((sum, deposit) => sum + deposit.amountCents, 0))} are waiting for a decision.`
            : "Nothing is waiting for a decision."}
        </p>
      </Card>
    </>
  );
}

export default function AdminPayoutsPage() {
  return (
    <>
      <PageHeader title="Withdrawals" description="Money owed to store owners and what they have asked to take out." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Payouts />
      </Suspense>
    </>
  );
}
