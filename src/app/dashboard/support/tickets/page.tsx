import { LifeBuoy, MessageSquarePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, dateTime, PageHeader, StatusBadge } from "@/components/admin/ui";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { requireStoreOwner } from "@/features/stores/guards";
import { CUSTOMER_SUPPORT_STATUS_LABELS, CUSTOMER_SUPPORT_STATUS_TONES, listOwnerTickets } from "@/features/support/queries";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Zendropship support" };

async function Tickets() {
  const { user } = await requireStoreOwner("/dashboard/support/tickets");
  const tickets = await listOwnerTickets(user.id, 50);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Customer service", href: "/dashboard/support" }, { label: "Zendropship support" }]}
        title="Your questions to Zendropship"
        description="Everything you have asked the Zendropship team, with their replies."
        actions={
          <ButtonLink href="/dashboard/support/tickets/new" size="sm">
            <MessageSquarePlus className="size-4" aria-hidden /> Ask Zendropship
          </ButtonLink>
        }
      />
      <Card padded={false}>
        {tickets.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={<LifeBuoy className="size-6" strokeWidth={1.5} />}
            title="No questions yet"
            description="Ask about a deposit, a withdrawal, a parcel — anything only Zendropship can answer."
            action={<ButtonLink href="/dashboard/support/tickets/new">Ask Zendropship</ButtonLink>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/dashboard/support/tickets/${ticket.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-4 hover:bg-canvas/60">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-ink-950">
                      {ticket.unreadForCustomer && <span className="size-1.5 shrink-0 rounded-full bg-iris-600" aria-label="New reply" />}
                      <span className="truncate">{ticket.subject}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[0.875rem] text-ink-600">{ticket.message}</p>
                    <p className="mt-1 text-[0.75rem] text-ink-500">
                      {dateTime.format(ticket.lastMessageAt)}
                      {ticket._count.replies > 0 ? ` · ${ticket._count.replies} repl${ticket._count.replies === 1 ? "y" : "ies"}` : ""}
                      {ticket.deposit ? ` · deposit ${formatMoney(ticket.deposit.amountCents)}` : ""}
                      {ticket.payout ? ` · withdrawal ${formatMoney(ticket.payout.amountCents)}` : ""}
                      {ticket.orderNumber ? ` · order ${ticket.orderNumber}` : ""}
                    </p>
                  </div>
                  <StatusBadge label={CUSTOMER_SUPPORT_STATUS_LABELS[ticket.status]} tone={CUSTOMER_SUPPORT_STATUS_TONES[ticket.status]} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function OwnerTicketsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Tickets />
    </Suspense>
  );
}
