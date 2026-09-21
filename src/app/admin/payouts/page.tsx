import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/forms";
import { Card, dateTime, PageHeader, StatTile, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { confirmDepositAction, markPayoutPaidAction, rejectDepositAction, rejectPayoutAction } from "@/features/wallet/actions";
import { DepositStatus, PayoutStatus } from "@/generated/prisma/enums";
import { can, requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Withdrawals & deposits" };

const PAYOUT_LABELS: Record<PayoutStatus, string> = { REQUESTED: "Requested", PAID: "Paid", REJECTED: "Declined" };
const PAYOUT_TONES: Record<PayoutStatus, "warning" | "success" | "danger"> = { REQUESTED: "warning", PAID: "success", REJECTED: "danger" };
const DEPOSIT_LABELS: Record<DepositStatus, string> = { PENDING: "Awaiting confirmation", CONFIRMED: "Credited", REJECTED: "Declined" };
const DEPOSIT_TONES: Record<DepositStatus, "warning" | "success" | "danger"> = { PENDING: "warning", CONFIRMED: "success", REJECTED: "danger" };

async function Payouts() {
  const user = await requirePagePermission("stores.view", "/admin/payouts");
  const canManage = can(user, "stores.manage");
  const [payouts, deposits, owed] = await Promise.all([
    db.payout.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { store: { select: { name: true, slug: true } }, requestedBy: { select: { email: true } } } }),
    db.deposit.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { store: { select: { name: true, slug: true } }, proof: { select: { url: true, width: true, height: true } } } }),
    db.walletEntry.aggregate({ _sum: { amountCents: true } }),
  ]);
  const requested = payouts.filter((payout) => payout.status === PayoutStatus.REQUESTED);
  const pendingDeposits = deposits.filter((deposit) => deposit.status === DepositStatus.PENDING);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Owed to owners" value={formatMoney(owed._sum.amountCents ?? 0)} hint="Total of every store balance" />
        <StatTile label="Withdrawals to send" value={requested.length} hint={formatMoney(requested.reduce((sum, payout) => sum + payout.amountCents, 0))} tone={requested.length ? "warning" : "default"} />
        <StatTile label="Deposits to confirm" value={pendingDeposits.length} tone={pendingDeposits.length ? "warning" : "default"} />
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
                  <p className="text-[0.8125rem] text-ink-800">{payout.method === "PAYPAL" ? "PayPal" : "Bank transfer"}</p>
                  <p className="line-clamp-2 break-words text-[0.8125rem] text-ink-600" title={payout.destination}>
                    {payout.destination}
                  </p>
                  {payout.note && <p className="mt-1 line-clamp-1 text-[0.75rem] text-ink-500">{payout.note}</p>}
                </Td>
                <Td>
                  <StatusBadge label={PAYOUT_LABELS[payout.status]} tone={PAYOUT_TONES[payout.status]} />
                  {payout.reference && <p className="mt-1 text-[0.75rem] text-ink-500">{payout.reference}</p>}
                </Td>
                {canManage && (
                  <Td className="whitespace-nowrap text-right">
                    {payout.status === PayoutStatus.REQUESTED && (
                      <span className="flex justify-end gap-2">
                        <ActionButton
                          action={markPayoutPaidAction.bind(null, payout.id, undefined)}
                          size="xs"
                          confirm={{ title: `Mark ${formatMoney(payout.amountCents)} as paid?`, description: "Only do this once the money has actually been sent.", confirmLabel: "Mark as paid" }}
                        >
                          Mark paid
                        </ActionButton>
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

      <Card className="mt-6" title="Deposits" description="Confirm only after the transfer has arrived — confirming credits the owner's balance." padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Recorded</Th>
              <Th>Store</Th>
              <Th className="text-right">Amount</Th>
              <Th>Sent by</Th>
              <Th>Proof</Th>
              <Th>Status</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {deposits.length === 0 && <TableEmpty colSpan={canManage ? 7 : 6}>No deposits yet.</TableEmpty>}
            {deposits.map((deposit) => (
              <tr key={deposit.id}>
                <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">{dateTime.format(deposit.createdAt)}</Td>
                <Td>
                  <Link href={`/admin/stores?q=${deposit.store.slug}`} className="font-medium text-ink-950 hover:underline">
                    {deposit.store.name}
                  </Link>
                </Td>
                <Td className="tabular text-right font-medium">{formatMoney(deposit.amountCents)}</Td>
                <Td className="max-w-[16rem] text-[0.8125rem] text-ink-600">
                  <p className="font-medium text-ink-800">{deposit.method === "CRYPTO" ? (deposit.network ?? "Crypto") : "Bank transfer"}</p>
                  {deposit.reference && (
                    <p className="break-all font-mono text-[0.75rem]" title={deposit.reference}>
                      {deposit.reference}
                    </p>
                  )}
                  {deposit.note && <p className="text-[0.75rem] text-ink-500">{deposit.note}</p>}
                </Td>
                <Td>
                  {deposit.proof ? (
                    <a href={deposit.proof.url} target="_blank" rel="noopener noreferrer" className="block w-16 overflow-hidden rounded-sm border border-line hover:border-ink-950" title="Open the full screenshot">
                      <Image src={deposit.proof.url} alt="Deposit proof" width={64} height={64} className="h-16 w-16 object-cover" />
                    </a>
                  ) : (
                    <span className="text-[0.8125rem] text-ink-400">None</span>
                  )}
                </Td>
                <Td>
                  <StatusBadge label={DEPOSIT_LABELS[deposit.status]} tone={DEPOSIT_TONES[deposit.status]} />
                </Td>
                {canManage && (
                  <Td className="whitespace-nowrap text-right">
                    {deposit.status === DepositStatus.PENDING && (
                      <span className="flex justify-end gap-2">
                        <ActionButton
                          action={confirmDepositAction.bind(null, deposit.id)}
                          size="xs"
                          confirm={{
                            title: `Credit ${formatMoney(deposit.amountCents)}?`,
                            description:
                              deposit.method === "CRYPTO"
                                ? "Check the transaction on the blockchain first — a screenshot is not proof. Confirm only once the funds have arrived in the Zendropship wallet."
                                : "Confirm only if this money has arrived in the Zendropship bank account.",
                            confirmLabel: "Confirm and credit",
                          }}
                        >
                          Confirm
                        </ActionButton>
                        <ActionButton
                          action={rejectDepositAction.bind(null, deposit.id, "No matching transfer found")}
                          size="xs"
                          variant="ghost"
                          confirm={{ title: "Decline this deposit?", description: "Nothing is credited to the owner.", confirmLabel: "Decline", destructive: true }}
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
    </>
  );
}

export default function AdminPayoutsPage() {
  return (
    <>
      <PageHeader title="Withdrawals & deposits" description="Money owed to store owners: what they have asked to withdraw, and transfers they say they have sent." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Payouts />
      </Suspense>
    </>
  );
}
