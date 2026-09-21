import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPagination, Card, dateTime, PageHeader, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { BalancePanel } from "@/components/dashboard/wallet";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { requireStoreOwner } from "@/features/stores/guards";
import { listStoreTransfers, listWalletEntries, getWalletSummary, WALLET_PAGE_SIZE } from "@/features/wallet/queries";
import { MIN_DEPOSIT_CENTS, MIN_PAYOUT_CENTS } from "@/features/wallet/service";
import { DepositStatus, PayoutStatus, WalletEntryType } from "@/generated/prisma/enums";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Balance" };

const ENTRY_LABELS: Record<WalletEntryType, string> = {
  ORDER_EARNING: "Order earnings",
  ORDER_REVERSAL: "Order reversed",
  PAYOUT: "Withdrawal",
  PAYOUT_REVERSAL: "Withdrawal returned",
  DEPOSIT: "Deposit",
  ADJUSTMENT: "Adjustment",
};

const PAYOUT_TONES: Record<PayoutStatus, "warning" | "success" | "danger"> = { REQUESTED: "warning", PAID: "success", REJECTED: "danger" };
const PAYOUT_LABELS: Record<PayoutStatus, string> = { REQUESTED: "Being sent", PAID: "Paid", REJECTED: "Declined" };
const DEPOSIT_TONES: Record<DepositStatus, "warning" | "success" | "danger"> = { PENDING: "warning", CONFIRMED: "success", REJECTED: "danger" };
const DEPOSIT_LABELS: Record<DepositStatus, string> = { PENDING: "Waiting for confirmation", CONFIRMED: "Credited", REJECTED: "Declined" };

async function Balance({ searchParams }: PageProps<"/dashboard/balance">) {
  const [{ store }, query] = await Promise.all([requireStoreOwner("/dashboard/balance"), searchParams]);
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const [summary, history, transfers] = await Promise.all([getWalletSummary(store.id), listWalletEntries(store.id, { page }), listStoreTransfers(store.id)]);
  const base = query as Record<string, string | string[] | undefined>;

  return (
    <>
      <BalancePanel summary={summary} minimumPayoutCents={MIN_PAYOUT_CENTS} minimumDepositCents={MIN_DEPOSIT_CENTS} supportEmail={store.supportEmail} />

      <Card className="mt-6" title="Transactions" description="Every movement in your balance, newest first." padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>What</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Balance after</Th>
            </tr>
          </thead>
          <tbody>
            {history.entries.length === 0 && (
              <TableEmpty colSpan={4}>
                <EmptyState
                  icon={<Wallet className="size-6" strokeWidth={1.5} />}
                  title="No transactions yet"
                  description="Your first sale adds its margin here as soon as the customer's payment is collected."
                  className="py-6"
                />
              </TableEmpty>
            )}
            {history.entries.map((entry) => (
              <tr key={entry.id}>
                <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">{dateTime.format(entry.createdAt)}</Td>
                <Td>
                  <p className="font-medium text-ink-950">{ENTRY_LABELS[entry.type]}</p>
                  <p className="text-[0.8125rem] text-ink-500">{entry.description}</p>
                </Td>
                <Td className={cn("tabular text-right font-medium", entry.amountCents >= 0 ? "text-success" : "text-ink-950")}>
                  {entry.amountCents >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(entry.amountCents))}
                </Td>
                <Td className="tabular text-right text-ink-600">{formatMoney(entry.balanceAfterCents)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <AdminPagination basePath="/dashboard/balance" query={base} page={history.page} pageCount={history.pageCount} total={history.total} pageSize={WALLET_PAGE_SIZE} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Withdrawals" description="Money sent to you by Zendropship.">
          {transfers.payouts.length === 0 ? (
            <p className="py-6 text-center text-[0.9375rem] text-ink-500">No withdrawals yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {transfers.payouts.map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="tabular font-medium text-ink-950">{formatMoney(payout.amountCents)}</p>
                    <p className="text-[0.8125rem] text-ink-500">
                      {dateTime.format(payout.createdAt)} · {payout.method === "PAYPAL" ? "PayPal" : "Bank transfer"}
                    </p>
                    {payout.reference && <p className="text-[0.75rem] text-ink-500">{payout.reference}</p>}
                  </div>
                  <StatusBadge label={PAYOUT_LABELS[payout.status]} tone={PAYOUT_TONES[payout.status]} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Deposits" description="Transfers you have sent to Zendropship.">
          {transfers.deposits.length === 0 ? (
            <p className="py-6 text-center text-[0.9375rem] text-ink-500">No deposits yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {transfers.deposits.map((deposit) => (
                <li key={deposit.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="tabular font-medium text-ink-950">{formatMoney(deposit.amountCents)}</p>
                    <p className="text-[0.8125rem] text-ink-500">{dateTime.format(deposit.createdAt)}</p>
                    {deposit.reference && <p className="text-[0.75rem] text-ink-500">{deposit.reference}</p>}
                  </div>
                  <StatusBadge label={DEPOSIT_LABELS[deposit.status]} tone={DEPOSIT_TONES[deposit.status]} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export default function BalancePage(props: PageProps<"/dashboard/balance">) {
  return (
    <>
      <PageHeader title="Balance" description="What Zendropship owes you, what you have earned, and every movement in between." />
      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
            <Skeleton className="h-72" />
          </div>
        }
      >
        <Balance {...props} />
      </Suspense>
    </>
  );
}
