import { Inbox, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AssignSelect, ConversationStatusButton, StaffReplyForm } from "@/components/admin/support/support-thread";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatusBadge } from "@/components/admin/ui";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { ContactStatus } from "@/generated/prisma/enums";
import { getSupportConversation, listSupportConversations, parseSupportStatus, staffMembers, SUPPORT_PAGE_SIZE, SUPPORT_STATUS_LABELS, SUPPORT_STATUS_TONES } from "@/features/support/queries";
import { markConversationReadAction } from "@/features/support/actions";
import { can, requirePagePermission } from "@/server/auth/guards";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Support inbox" };

const SCOPES = [
  { value: "all", label: "Everything" },
  { value: "platform", label: "To Zendropship" },
  { value: "stores", label: "In owners' stores" },
  { value: "mine", label: "Assigned to me" },
] as const;

type Scope = (typeof SCOPES)[number]["value"];

async function Messages({ searchParams }: PageProps<"/admin/messages">) {
  const [user, query] = await Promise.all([requirePagePermission("messages.view", "/admin/messages"), searchParams]);
  const status = parseSupportStatus(query.status);
  const scope = (SCOPES.find((option) => option.value === query.scope)?.value ?? "all") as Scope;
  const q = typeof query.q === "string" ? query.q : "";
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const selectedId = typeof query.id === "string" ? query.id : null;

  const [inbox, selected, staff] = await Promise.all([
    listSupportConversations({ status, scope, q, page, assignedToId: user.id }),
    selectedId ? getSupportConversation(selectedId) : null,
    staffMembers(),
  ]);
  // Opening a conversation is what marks it read.
  if (selected?.unreadForStaff) await markConversationReadAction(selected.id);

  const base = query as Record<string, string | string[] | undefined>;
  const canReply = can(user, "messages.view");
  const turns = selected
    ? [
        { id: "first", kind: "customer" as const, body: selected.message, at: selected.createdAt, author: selected.name },
        ...selected.replies.map((reply) => ({
          id: reply.id,
          kind: reply.isInternal ? ("note" as const) : reply.isFromCustomer ? ("customer" as const) : ("agent" as const),
          body: reply.body,
          at: reply.createdAt,
          author: reply.isFromCustomer ? selected.name : reply.author ? `${reply.author.firstName} ${reply.author.lastName}` : (selected.store?.name ?? "Zendropship"),
        })),
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Support inbox"
        description="Every conversation with customers and store owners. Replies are emailed and appear in the customer's account."
        actions={inbox.unread > 0 ? <StatusBadge label={`${inbox.unread} unread`} tone="warning" /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SCOPES.map((option) => (
          <FilterLink key={option.value} href={`/admin/messages${buildQuery(base, { scope: option.value === "all" ? null : option.value, page: null, id: null })}`} active={scope === option.value}>
            {option.label}
          </FilterLink>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <FilterLink href={`/admin/messages${buildQuery(base, { status: null, page: null })}`} active={!status}>
          All
        </FilterLink>
        {(Object.keys(ContactStatus) as ContactStatus[]).map((value) => (
          <FilterLink key={value} href={`/admin/messages${buildQuery(base, { status: value, page: null })}`} active={status === value}>
            {SUPPORT_STATUS_LABELS[value]} <span className="tabular ml-1.5 opacity-60">{inbox.counts[value] ?? 0}</span>
          </FilterLink>
        ))}
        <form className="ml-auto flex items-center gap-2" action="/admin/messages">
          {scope !== "all" && <input type="hidden" name="scope" value={scope} />}
          {status && <input type="hidden" name="status" value={status} />}
          <Input name="q" defaultValue={q} placeholder="Search subject, customer, order…" className="h-9 w-56 text-[0.875rem]" aria-label="Search conversations" />
          <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[0.875rem] hover:border-ink-400">
            <Search className="size-3.5" aria-hidden /> Search
          </button>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card padded={false} className="xl:col-span-2">
          {inbox.conversations.length === 0 ? (
            <p className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">No conversations{q ? " match that search" : ""}.</p>
          ) : (
            <ul className="divide-y divide-line">
              {inbox.conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link href={`/admin/messages${buildQuery(base, { id: conversation.id })}`} className={cn("block px-5 py-3.5 hover:bg-canvas/60", selectedId === conversation.id && "bg-iris-50")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", conversation.unreadForStaff ? "font-semibold" : "font-medium")}>
                        {conversation.unreadForStaff && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-iris-600" aria-label="Unread" />}
                        {conversation.subject}
                      </span>
                      <StatusBadge label={SUPPORT_STATUS_LABELS[conversation.status]} tone={SUPPORT_STATUS_TONES[conversation.status]} />
                    </div>
                    <p className="mt-0.5 truncate text-[0.8125rem] text-ink-600">
                      {conversation.name} · {conversation.email}
                    </p>
                    <p className="truncate text-[0.75rem] text-ink-400">
                      {dateTime.format(conversation.lastMessageAt)}
                      {conversation.store ? ` · ${conversation.store.name}` : " · Zendropship"}
                      {conversation.orderNumber ? ` · ${conversation.orderNumber}` : ""}
                      {conversation.assignedTo ? ` · ${conversation.assignedTo.firstName}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <AdminPagination basePath="/admin/messages" query={base} page={inbox.page} pageCount={inbox.pageCount} total={inbox.total} pageSize={SUPPORT_PAGE_SIZE} />
        </Card>

        <Card className="xl:col-span-3" title={selected ? selected.subject : "Select a conversation"}>
          {selected ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div className="min-w-0 text-sm">
                  <p className="text-ink-600">
                    From <span className="font-medium text-ink-950">{selected.name}</span> ·{" "}
                    <a href={`mailto:${selected.email}`} className="underline underline-offset-2">
                      {selected.email}
                    </a>
                    {selected.user ? " · has an account" : " · guest"}
                  </p>
                  <p className="mt-1 text-ink-600">
                    {selected.store ? (
                      <>
                        Store:{" "}
                        <Link href={`/admin/stores?q=${selected.store.slug}`} className="font-medium text-ink-950 hover:underline">
                          {selected.store.name}
                        </Link>
                      </>
                    ) : (
                      "Written to Zendropship"
                    )}
                    {selected.order && (
                      <>
                        {" · order "}
                        <Link href={`/admin/orders/${selected.order.id}`} className="tabular font-medium text-ink-950 hover:underline">
                          {selected.order.number}
                        </Link>{" "}
                        <span className="text-ink-500">
                          ({formatMoney(selected.order.totalCents, selected.order.currency)} · {selected.order.status.toLowerCase().replace(/_/g, " ")})
                        </span>
                      </>
                    )}
                    {!selected.order && selected.orderNumber && <> · order {selected.orderNumber} (not found in this store)</>}
                  </p>
                </div>
                <AssignSelect messageId={selected.id} assignedToId={selected.assignedToId} staff={staff.map((member) => ({ id: member.id, name: `${member.firstName} ${member.lastName}` }))} />
              </div>

              <ol className="mt-5 space-y-3">
                {turns.map((turn) => (
                  <li
                    key={turn.id}
                    className={cn(
                      "rounded-md px-4 py-3 text-[0.9375rem] leading-relaxed",
                      turn.kind === "customer" ? "bg-canvas text-ink-800" : turn.kind === "note" ? "border border-dashed border-line-strong bg-surface text-ink-700" : "bg-iris-50 text-ink-800",
                    )}
                  >
                    <p className="text-[0.75rem] font-medium text-ink-500">
                      {turn.kind === "note" ? "Internal note" : turn.author} · {dateTime.format(turn.at)}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{turn.body}</p>
                  </li>
                ))}
              </ol>

              <div className="mt-5 flex flex-wrap gap-2">
                {selected.status !== ContactStatus.IN_PROGRESS && (
                  <ConversationStatusButton messageId={selected.id} status="IN_PROGRESS">
                    Mark in progress
                  </ConversationStatusButton>
                )}
                {selected.status !== ContactStatus.RESOLVED && (
                  <ConversationStatusButton messageId={selected.id} status="RESOLVED">
                    Mark resolved
                  </ConversationStatusButton>
                )}
                {selected.status === ContactStatus.RESOLVED && (
                  <ConversationStatusButton messageId={selected.id} status="NEW">
                    Reopen
                  </ConversationStatusButton>
                )}
              </div>

              {canReply && <StaffReplyForm messageId={selected.id} customerName={selected.name} replyingAs={selected.store?.ownerId ? selected.store.name : "Zendropship"} />}
            </div>
          ) : (
            <div className="flex flex-col items-center py-14 text-center">
              <Inbox className="mb-3 size-6 text-ink-400" strokeWidth={1.5} aria-hidden />
              <p className="text-sm text-ink-500">Choose a conversation from the list to read and answer it.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function MessagesPage(props: PageProps<"/admin/messages">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Messages {...props} />
    </Suspense>
  );
}
