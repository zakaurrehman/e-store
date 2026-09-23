import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepositReview, ProofThumbnail } from "@/components/admin/deposits/deposit-review";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatTile, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { DEPOSIT_STATUS_LABELS, DEPOSIT_STATUS_TONES, DEPOSITS_PAGE_SIZE, listDepositsForAdmin, parseDepositStatus, type AdminDeposit } from "@/features/admin/deposits";
import { DepositStatus } from "@/generated/prisma/enums";
import { can, requirePagePermission } from "@/server/auth/guards";
import { formatMoney } from "@/utils/money";
import { depositMethodLabel, tronscanTransactionUrl } from "@/lib/money-methods";
import { looksLikeTrc20TxId } from "@/lib/tron";

export const metadata: Metadata = { title: "Deposit requests" };

const FILTERS = [
  { value: "", label: "All" },
  { value: DepositStatus.PENDING, label: "Pending" },
  { value: DepositStatus.CONFIRMED, label: "Approved" },
  { value: DepositStatus.REJECTED, label: "Rejected" },
] as const;

/** Who sent the money: the owner on the account, falling back to whoever filled the form. */
function depositor(deposit: AdminDeposit) {
  const person = deposit.store.owner ?? deposit.createdBy;
  if (!person) return { name: "Unknown", email: null as string | null, phone: null as string | null, id: null as string | null };
  return {
    name: `${person.firstName} ${person.lastName}`.trim(),
    email: person.email,
    // The owner's account phone, or the one on the account that recorded it.
    phone: person.phone ?? deposit.createdBy?.phone ?? null,
    id: person.id,
  };
}

async function Deposits({ searchParams }: PageProps<"/admin/deposits">) {
  const [user, query] = await Promise.all([requirePagePermission("stores.view", "/admin/deposits"), searchParams]);
  const status = parseDepositStatus(query.status);
  const q = typeof query.q === "string" ? query.q : "";
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const data = await listDepositsForAdmin({ status, q, page });
  const canManage = can(user, "stores.manage");
  const base = query as Record<string, string | string[] | undefined>;

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Waiting for a decision" value={data.counts.pending.count} hint={formatMoney(data.counts.pending.cents)} tone={data.counts.pending.count ? "warning" : "default"} />
        <StatTile label="Approved and credited" value={data.counts.approved.count} hint={formatMoney(data.counts.approved.cents)} />
        <StatTile label="Rejected" value={data.counts.rejected.count} hint={formatMoney(data.counts.rejected.cents)} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          {FILTERS.map((filter) => (
            <FilterLink key={filter.label} href={`/admin/deposits${buildQuery(base, { status: filter.value || null, page: null })}`} active={(status ?? "") === filter.value}>
              {filter.label}
            </FilterLink>
          ))}
          <form className="ml-auto flex gap-2" role="search" action="/admin/deposits">
            {status && <input type="hidden" name="status" value={status} />}
            <label htmlFor="deposit-search" className="sr-only">
              Search deposits
            </label>
            <Input id="deposit-search" name="q" defaultValue={q} placeholder="Owner, store or reference" className="h-9 w-64" />
          </form>
        </div>

        <Table className="[&_table]:min-w-[62rem]">
          <thead>
            <tr>
              <Th>Submitted</Th>
              <Th>Owner</Th>
              <Th>Store</Th>
              <Th className="text-right">Amount</Th>
              <Th>Payment details</Th>
              <Th>Proof</Th>
              <Th>Status</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {data.deposits.length === 0 && <TableEmpty colSpan={canManage ? 8 : 7}>No deposits{q || status ? " match" : " yet"}.</TableEmpty>}
            {data.deposits.map((deposit) => {
              const person = depositor(deposit);
              const credit = deposit.entries[0];
              return (
                <tr key={deposit.id} className="align-top">
                  <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">{dateTime.format(deposit.createdAt)}</Td>
                  <Td className="w-[15rem] max-w-[15rem]">
                    {person.id ? (
                      <Link href={`/admin/customers/${person.id}`} className="font-medium text-ink-950 hover:underline">
                        {person.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-950">{person.name}</span>
                    )}
                    {person.email && (
                      <a href={`mailto:${person.email}`} className="mt-0.5 flex items-center gap-1.5 truncate text-[0.75rem] text-ink-600 hover:text-ink-950" title={person.email}>
                        <Mail className="size-3 shrink-0" aria-hidden /> {person.email}
                      </a>
                    )}
                    <span className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-ink-500">
                      <Phone className="size-3 shrink-0" aria-hidden />
                      {person.phone ? (
                        <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="hover:text-ink-950">
                          {person.phone}
                        </a>
                      ) : (
                        "No phone on file"
                      )}
                    </span>
                  </Td>
                  <Td className="w-[11rem] max-w-[11rem]">
                    <Link href={`/admin/stores/${deposit.store.id}`} className="block truncate font-medium text-ink-950 hover:underline">
                      {deposit.store.name}
                    </Link>
                    <span className="block truncate text-[0.75rem] text-ink-500">{deposit.store.slug}</span>
                  </Td>
                  <Td className="tabular whitespace-nowrap text-right font-medium">
                    {formatMoney(deposit.amountCents)}
                    {credit && credit.amountCents !== deposit.amountCents && <span className="block text-[0.75rem] font-normal text-ink-500">declared differently</span>}
                  </Td>
                  <Td className="w-[15rem] max-w-[15rem] text-[0.8125rem] text-ink-600">
                    <p className="whitespace-nowrap font-medium text-ink-800">{depositMethodLabel(deposit)}</p>
                    {deposit.reference &&
                      (deposit.method === "USDT_TRC20" && looksLikeTrc20TxId(deposit.reference) ? (
                        <a
                          href={tronscanTransactionUrl(deposit.reference)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate font-mono text-[0.75rem] underline underline-offset-2 hover:text-ink-950"
                          title="Check this transaction on Tronscan"
                        >
                          {deposit.reference}
                        </a>
                      ) : (
                        <p className="truncate font-mono text-[0.75rem]" title={deposit.reference}>
                          {deposit.reference}
                        </p>
                      ))}
                    {deposit.note && (
                      <p className="line-clamp-2 text-[0.75rem] text-ink-500" title={deposit.note}>
                        {deposit.note}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <ProofThumbnail proof={deposit.proof} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <StatusBadge label={DEPOSIT_STATUS_LABELS[deposit.status]} tone={DEPOSIT_STATUS_TONES[deposit.status]} />
                    {deposit.status === DepositStatus.CONFIRMED && credit && (
                      <p className="mt-1 text-[0.75rem] text-ink-500">
                        {formatMoney(credit.amountCents)} credited
                        {deposit.confirmedBy ? ` · ${deposit.confirmedBy.firstName} ${deposit.confirmedBy.lastName}` : ""}
                      </p>
                    )}
                    {deposit.status === DepositStatus.REJECTED && deposit.confirmedAt && (
                      <p className="mt-1 text-[0.75rem] text-ink-500">{dateTime.format(deposit.confirmedAt)}</p>
                    )}
                  </Td>
                  {canManage && (
                    <Td className="text-right">
                      {deposit.status === DepositStatus.PENDING && (
                        <DepositReview
                          depositId={deposit.id}
                          amountCents={deposit.amountCents}
                          storeName={deposit.store.name}
                          ownerName={person.name}
                          method={depositMethodLabel(deposit)}
                          transactionUrl={deposit.method === "USDT_TRC20" && deposit.reference && looksLikeTrc20TxId(deposit.reference) ? tronscanTransactionUrl(deposit.reference) : null}
                          reference={deposit.reference}
                          proof={deposit.proof}
                        />
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
        <AdminPagination basePath="/admin/deposits" query={base} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={DEPOSITS_PAGE_SIZE} />
      </Card>
    </>
  );
}

export default function AdminDepositsPage(props: PageProps<"/admin/deposits">) {
  return (
    <>
      <PageHeader
        title="Deposit requests"
        description="Transfers store owners say they have sent. Check the proof, then credit the wallet — nothing is credited until you approve it."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Deposits {...props} />
      </Suspense>
    </>
  );
}
