import { LifeBuoy, Mail, MessageSquare, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatusBadge } from "@/components/admin/ui";
import { ReplyForm, StatusButton } from "@/components/dashboard/support-thread";
import { Input } from "@/components/ui/field";
import { SupportPulse } from "@/components/support/support-pulse";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { requireStoreOwner } from "@/features/stores/guards";
import { markStoreMessageReadAction } from "@/features/support/actions";
import {
  CUSTOMER_SUPPORT_STATUS_LABELS,
  CUSTOMER_SUPPORT_STATUS_TONES,
  getStoreMessage,
  listOwnerTickets,
  listStoreMessages,
  parseSupportStatus,
  SUPPORT_PAGE_SIZE,
  SUPPORT_STATUS_LABELS,
  SUPPORT_STATUS_TONES,
  supportPulseStamp,
} from "@/features/support/queries";
import { ContactStatus } from "@/generated/prisma/enums";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Customer service" };

async function Inbox({ searchParams }: PageProps<"/dashboard/support">) {
  const [{ user, store }, query] = await Promise.all([requireStoreOwner("/dashboard/support"), searchParams]);
  const status = parseSupportStatus(query.status);
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const selectedId = typeof query.id === "string" ? query.id : null;
  const q = typeof query.q === "string" ? query.q : "";
  const [data, selected, tickets] = await Promise.all([
    listStoreMessages(store.id, { status, page, q }),
    selectedId ? getStoreMessage(store.id, selectedId) : null,
    listOwnerTickets(user.id, 5),
  ]);
  // Opening a thread is what marks it read.
  if (selected?.unreadForStaff) await markStoreMessageReadAction(selected.id);
  const base = query as Record<string, string | string[] | undefined>;

  const pulse = await supportPulseStamp(user);
  return (
    <>
      <SupportPulse stamp={pulse} />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={`/dashboard/support${buildQuery(base, { status: null, page: null, id: null })}`} active={!status}>
          All
        </FilterLink>
        {(Object.keys(SUPPORT_STATUS_LABELS) as ContactStatus[]).map((value) => (
          <FilterLink key={value} href={`/dashboard/support${buildQuery(base, { status: value, page: null, id: null })}`} active={status === value}>
            {SUPPORT_STATUS_LABELS[value]} <span className="tabular ml-1.5 opacity-60">{data.counts[value] ?? 0}</span>
          </FilterLink>
        ))}
        <form className="ml-auto flex items-center gap-2" action="/dashboard/support">
          {status && <input type="hidden" name="status" value={status} />}
          <Input name="q" defaultValue={q} placeholder="Search name, subject, order…" className="h-9 w-56 text-[0.875rem]" aria-label="Search messages" />
          <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[0.875rem] hover:border-ink-400">
            <Search className="size-3.5" aria-hidden /> Search
          </button>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card padded={false} className="xl:col-span-2">
          {data.messages.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={<MessageSquare className="size-6" strokeWidth={1.5} />}
                title={status ? "Nothing with this status" : "No messages yet"}
                description={status ? "Try another filter." : "Messages sent from your store's contact page arrive here, and you'll get an email when one does."}
                className="py-4"
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.messages.map((message) => (
                <li key={message.id}>
                  <Link href={`/dashboard/support${buildQuery(base, { id: message.id })}`} className={cn("block px-5 py-3.5 hover:bg-canvas/60", selectedId === message.id && "bg-iris-50")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", message.unreadForStaff ? "font-semibold" : "font-medium")}>
                        {message.unreadForStaff && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-iris-600" aria-label="Unread" />}
                        {message.subject}
                      </span>
                      <StatusBadge label={SUPPORT_STATUS_LABELS[message.status]} tone={SUPPORT_STATUS_TONES[message.status]} />
                    </div>
                    <p className="mt-0.5 truncate text-[0.8125rem] text-ink-600">
                      {message.name} · {message.email}
                    </p>
                    <p className="text-[0.75rem] text-ink-400">
                      {dateTime.format(message.lastMessageAt)}
                      {message.orderNumber ? ` · ${message.orderNumber}` : ""}
                      {message._count.replies > 0 && ` · ${message._count.replies} ${message._count.replies === 1 ? "reply" : "replies"}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <AdminPagination basePath="/dashboard/support" query={base} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={SUPPORT_PAGE_SIZE} />
        </Card>

        <Card className="xl:col-span-3" title={selected ? selected.subject : "Select a message"}>
          {selected ? (
            <div>
              <p className="text-sm text-ink-600">
                From <span className="font-medium text-ink-950">{selected.name}</span> ·{" "}
                <a href={`mailto:${selected.email}`} className="underline underline-offset-2">
                  {selected.email}
                </a>
                {selected.orderNumber && (
                  <>
                    {" · Order "}
                    <Link href={`/dashboard/orders/${selected.orderNumber}`} className="tabular font-medium text-ink-950 underline underline-offset-2">
                      {selected.orderNumber}
                    </Link>
                  </>
                )}
                <br />
                {dateTime.format(selected.createdAt)}
              </p>
              <p className="mt-5 whitespace-pre-line rounded-md bg-canvas p-4 text-[0.9375rem] leading-relaxed text-ink-800">{selected.message}</p>

              {selected.replies.length > 0 && (
                <ol className="mt-5 space-y-3">
                  {selected.replies.map((reply) => (
                    <li key={reply.id} className={cn("rounded-md p-4", reply.isFromCustomer ? "bg-canvas" : "border border-line")}>
                      <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-500">
                        {reply.isFromCustomer ? <MessageSquare className="size-3.5" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
                        {reply.isFromCustomer ? `${selected.name} wrote back` : `Sent by ${reply.author ? `${reply.author.firstName} ${reply.author.lastName}` : "your store"}`} · {dateTime.format(reply.createdAt)}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-800">{reply.body}</p>
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {selected.status !== ContactStatus.IN_PROGRESS && selected.status !== ContactStatus.RESOLVED && (
                  <StatusButton messageId={selected.id} status="IN_PROGRESS">
                    Mark in progress
                  </StatusButton>
                )}
                {selected.status !== ContactStatus.RESOLVED ? (
                  <StatusButton messageId={selected.id} status="RESOLVED">
                    Mark resolved
                  </StatusButton>
                ) : (
                  <StatusButton messageId={selected.id} status="NEW">
                    Reopen
                  </StatusButton>
                )}
              </div>

              <ReplyForm messageId={selected.id} customerName={selected.name.split(" ")[0] || selected.name} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-500">{data.total === 0 ? "When a customer writes to your store, their message appears here." : "Choose a message from the list to read and reply."}</p>
          )}
        </Card>
      </div>

      <Card
        className="mt-6"
        title="Your questions to Zendropship"
        description="Anything you cannot answer yourself — a deposit, a withdrawal, a parcel that went missing."
        actions={
          <span className="flex flex-wrap gap-2">
            {tickets.length > 0 && (
              <Link href="/dashboard/support/tickets" className="inline-flex h-9 items-center rounded-sm px-3 text-[0.875rem] font-medium text-ink-700 hover:text-ink-950">
                See all
              </Link>
            )}
            <Link href="/dashboard/support/tickets/new" className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[0.875rem] font-medium hover:border-ink-950">
              <LifeBuoy className="size-4" aria-hidden /> Ask Zendropship
            </Link>
          </span>
        }
      >
        {tickets.length === 0 ? (
          <p className="py-4 text-[0.9375rem] text-ink-500">
            You have not written to Zendropship yet.{" "}
            <Link href="/dashboard/support/tickets/new" className="font-medium text-ink-950 underline underline-offset-4">
              Ask them something
            </Link>{" "}
            — replies arrive here and by email.
          </p>
        ) : (
          <ul className="-mx-5 divide-y divide-line">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/dashboard/support/tickets/${ticket.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-canvas/60">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-950">
                      {ticket.unreadForCustomer && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-iris-600" aria-label="New reply" />}
                      {ticket.subject}
                    </p>
                    <p className="text-[0.8125rem] text-ink-500">
                      {dateTime.format(ticket.lastMessageAt)}
                      {ticket._count.replies > 0 ? ` · ${ticket._count.replies} repl${ticket._count.replies === 1 ? "y" : "ies"}` : ""}
                      {ticket.deposit ? ` · deposit ${formatMoney(ticket.deposit.amountCents)}` : ""}
                      {ticket.payout ? ` · withdrawal ${formatMoney(ticket.payout.amountCents)}` : ""}
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

export default function SupportPage(props: PageProps<"/dashboard/support">) {
  return (
    <>
      <PageHeader title="Customer service" description="Your customers' messages, which you answer in your store's name, and your own questions to Zendropship." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Inbox {...props} />
      </Suspense>
    </>
  );
}
