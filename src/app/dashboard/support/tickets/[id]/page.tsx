import { ArrowLeft, CheckCircle2, LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, dateTime, PageHeader, StatusBadge } from "@/components/admin/ui";
import { TicketReplyForm } from "@/components/dashboard/ticket-thread";
import { SupportPulse } from "@/components/support/support-pulse";
import { Alert, Skeleton } from "@/components/ui/misc";
import { requireStoreOwner } from "@/features/stores/guards";
import { markOwnerTicketReadAction } from "@/features/support/actions";
import { CUSTOMER_SUPPORT_STATUS_LABELS, CUSTOMER_SUPPORT_STATUS_TONES, getOwnerTicket, type OwnerTicket, supportPulseStamp } from "@/features/support/queries";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Zendropship support" };

const DEPOSIT_LABELS: Record<string, string> = { PENDING: "Waiting for confirmation", CONFIRMED: "Credited", REJECTED: "Declined" };
const PAYOUT_LABELS: Record<string, string> = { REQUESTED: "Requested", APPROVED: "Approved", PROCESSING: "Being sent", PAID: "Paid", REJECTED: "Declined" };

/** What the conversation is about, when the owner started it from an order, a deposit or a withdrawal. */
function AboutCard({ ticket }: { ticket: OwnerTicket }) {
  if (!ticket.deposit && !ticket.payout && !ticket.order && !ticket.orderNumber) return null;
  return (
    <Card title="What this is about">
      <dl className="space-y-3 text-[0.9375rem]">
        {ticket.deposit && (
          <div>
            <dt className="text-[0.8125rem] text-ink-500">Deposit</dt>
            <dd className="text-ink-950">
              {formatMoney(ticket.deposit.amountCents)} · {ticket.deposit.method === "CRYPTO" ? (ticket.deposit.network ?? "Crypto") : "Bank transfer"} · {DEPOSIT_LABELS[ticket.deposit.status] ?? ticket.deposit.status}
              <span className="block text-[0.8125rem] text-ink-500">
                {dateTime.format(ticket.deposit.createdAt)}
                {ticket.deposit.reference ? ` · ${ticket.deposit.reference}` : ""}
              </span>
            </dd>
          </div>
        )}
        {ticket.payout && (
          <div>
            <dt className="text-[0.8125rem] text-ink-500">Withdrawal</dt>
            <dd className="text-ink-950">
              {formatMoney(ticket.payout.amountCents)} · {ticket.payout.method === "PAYPAL" ? "PayPal" : "Bank transfer"} · {PAYOUT_LABELS[ticket.payout.status] ?? ticket.payout.status}
              <span className="block text-[0.8125rem] text-ink-500">{dateTime.format(ticket.payout.createdAt)}</span>
            </dd>
          </div>
        )}
        {(ticket.order || ticket.orderNumber) && (
          <div>
            <dt className="text-[0.8125rem] text-ink-500">Order</dt>
            <dd className="text-ink-950">
              {ticket.order ? (
                <Link href={`/dashboard/orders/${ticket.order.number}`} className="tabular font-medium underline underline-offset-4">
                  {ticket.order.number}
                </Link>
              ) : (
                <span className="tabular">{ticket.orderNumber}</span>
              )}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] text-ink-500">Zendropship staff see this beside your message.</p>
    </Card>
  );
}

async function Thread({ params, searchParams }: PageProps<"/dashboard/support/tickets/[id]">) {
  const [{ user }, { id }, query] = await Promise.all([requireStoreOwner("/dashboard/support"), params, searchParams]);
  const ticket = await getOwnerTicket(user.id, id);
  if (!ticket) notFound();
  // Opening the thread is what clears its "new reply" mark.
  await markOwnerTicketReadAction(ticket.id);

  const turns = [
    { id: "first", from: "owner" as const, body: ticket.message, at: ticket.createdAt, author: "You" },
    ...ticket.replies.map((reply) => ({
      id: reply.id,
      from: reply.isFromCustomer ? ("owner" as const) : ("staff" as const),
      body: reply.body,
      at: reply.createdAt,
      // Staff answer as Zendropship: which colleague picked it up is internal.
      author: reply.isFromCustomer ? "You" : "Zendropship",
    })),
  ];

  const pulse = await supportPulseStamp(user);
  return (
    <>
      <SupportPulse stamp={pulse} />
      <PageHeader
        breadcrumb={[
          { label: "Customer service", href: "/dashboard/support" },
          { label: "Zendropship support", href: "/dashboard/support/tickets" },
          { label: ticket.subject },
        ]}
        title={ticket.subject}
        description={`Opened ${dateTime.format(ticket.createdAt)}`}
        actions={<StatusBadge label={CUSTOMER_SUPPORT_STATUS_LABELS[ticket.status]} tone={CUSTOMER_SUPPORT_STATUS_TONES[ticket.status]} />}
      />

      {query.sent === "1" && (
        <Alert tone="success" title="Message sent" className="mb-6">
          Zendropship has your message and will reply here — you will also get an email.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Conversation">
            <ol className="space-y-4">
              {turns.map((turn) => (
                <li key={turn.id} className={cn("flex", turn.from === "owner" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[42rem] rounded-lg px-4 py-3", turn.from === "owner" ? "bg-ink-950 text-white" : "border border-line bg-canvas")}>
                    <p className={cn("text-[0.75rem] font-medium", turn.from === "owner" ? "text-white/70" : "text-ink-500")}>
                      {turn.author} · {dateTime.format(turn.at)}
                    </p>
                    <p className={cn("mt-1 whitespace-pre-line text-[0.9375rem] leading-relaxed", turn.from === "owner" ? "text-white" : "text-ink-800")}>{turn.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t border-line pt-5">
              {ticket.status === "RESOLVED" && (
                <p className="mb-4 flex items-center gap-2 text-[0.875rem] text-success">
                  <CheckCircle2 className="size-4" aria-hidden /> Marked resolved by Zendropship. Writing again reopens it.
                </p>
              )}
              <TicketReplyForm ticketId={ticket.id} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <AboutCard ticket={ticket} />
          <Card title="About Zendropship support">
            <p className="text-[0.9375rem] leading-relaxed text-ink-600">
              Deposits, withdrawals, a parcel that went missing, anything about your store — this thread reaches the Zendropship team. Replies appear here and in your email.
            </p>
            <Link href="/dashboard/support/tickets/new" className="mt-3 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink-950 underline decoration-ink-300 underline-offset-4">
              <LifeBuoy className="size-4" aria-hidden /> Ask about something else
            </Link>
          </Card>
        </div>
      </div>

      <p className="mt-6">
        <Link href="/dashboard/support" className="inline-flex items-center gap-1.5 text-[0.875rem] text-ink-600 hover:text-ink-950">
          <ArrowLeft className="size-4" aria-hidden /> Back to Customer service
        </Link>
      </p>
    </>
  );
}

export default function OwnerTicketPage(props: PageProps<"/dashboard/support/tickets/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Thread {...props} />
    </Suspense>
  );
}
