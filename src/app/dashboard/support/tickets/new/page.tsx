import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader } from "@/components/admin/ui";
import { NewTicketForm } from "@/components/dashboard/ticket-thread";
import { Skeleton } from "@/components/ui/misc";
import { requireStoreOwner } from "@/features/stores/guards";
import { db } from "@/server/db";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Ask Zendropship" };

const str = (value: string | string[] | undefined, max = 120) => (typeof value === "string" ? value.slice(0, max) : undefined);

/**
 * Asking Zendropship something from inside the dashboard. When the owner comes from a deposit or a
 * withdrawal, that row is looked up in their own store and attached, so staff open the thread with the
 * money already in front of them.
 */
async function NewTicket({ searchParams }: PageProps<"/dashboard/support/tickets/new">) {
  const [{ store }, query] = await Promise.all([requireStoreOwner("/dashboard/support/tickets/new"), searchParams]);
  const depositId = str(query.deposit, 40);
  const payoutId = str(query.payout, 40);
  const [deposit, payout] = await Promise.all([
    depositId ? db.deposit.findFirst({ where: { id: depositId, storeId: store.id }, select: { id: true, amountCents: true, reference: true, createdAt: true } }) : null,
    payoutId ? db.payout.findFirst({ where: { id: payoutId, storeId: store.id }, select: { id: true, amountCents: true, createdAt: true } }) : null,
  ]);

  const subject =
    str(query.subject) ??
    (deposit ? `Deposit of ${formatMoney(deposit.amountCents)}` : payout ? `Withdrawal of ${formatMoney(payout.amountCents)}` : undefined);
  const message = deposit?.reference ? `Reference: ${deposit.reference}\n\n` : undefined;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Customer service", href: "/dashboard/support" }, { label: "Ask Zendropship" }]}
        title="Ask Zendropship"
        description="Questions only Zendropship can answer: deposits, withdrawals, fulfilment, your store. Replies arrive in this thread and by email."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Your message">
          <NewTicketForm defaults={{ subject, message, orderNumber: str(query.order, 20), depositId: deposit?.id, payoutId: payout?.id }} />
        </Card>
        <Card title="Before you write">
          <ul className="space-y-3 text-[0.9375rem] leading-relaxed text-ink-600">
            <li>A deposit is credited once Zendropship confirms the transfer arrived — give the reference or transaction id and it can be found faster.</li>
            <li>A withdrawal leaves your available balance straight away and is marked paid when the transfer is sent.</li>
            <li>For a customer&rsquo;s question about their own order, answer them from <span className="font-medium text-ink-950">Customer service</span> instead.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

export default function NewTicketPage(props: PageProps<"/dashboard/support/tickets/new">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NewTicket {...props} />
    </Suspense>
  );
}
