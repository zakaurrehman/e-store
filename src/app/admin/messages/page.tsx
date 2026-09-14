import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/forms";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatusBadge } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { setMessageStatusAction } from "@/features/admin/messages";
import { ContactStatus } from "@/generated/prisma/enums";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { cn } from "@/utils/cn";

export const metadata: Metadata = { title: "Messages" };
const PAGE_SIZE = 20;
const TONE: Record<string, "warning" | "info" | "success"> = { NEW: "warning", IN_PROGRESS: "info", RESOLVED: "success" };
const LABEL: Record<string, string> = { NEW: "New", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };

async function Messages({ searchParams }: PageProps<"/admin/messages">) {
  const [, query] = await Promise.all([requirePagePermission("messages.view", "/admin/messages"), searchParams]);
  const status = typeof query.status === "string" && query.status in ContactStatus ? (query.status as ContactStatus) : undefined;
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const selectedId = typeof query.id === "string" ? query.id : null;
  const where = status ? { status } : {};
  const [total, messages, counts, selected] = await Promise.all([
    db.contactMessage.count({ where }),
    db.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.contactMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    selectedId ? db.contactMessage.findUnique({ where: { id: selectedId } }) : null,
  ]);
  const countBy = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  const base = query as Record<string, string | string[] | undefined>;
  return (
    <>
      <PageHeader title="Messages" description="Contact form submissions. Reply from your email client; track progress here." />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={`/admin/messages${buildQuery(base, { status: null, page: null })}`} active={!status}>
          All
        </FilterLink>
        {(["NEW", "IN_PROGRESS", "RESOLVED"] as const).map((value) => (
          <FilterLink key={value} href={`/admin/messages${buildQuery(base, { status: value, page: null })}`} active={status === value}>
            {LABEL[value]} <span className="tabular ml-1.5 opacity-60">{countBy[value] ?? 0}</span>
          </FilterLink>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card padded={false} className="xl:col-span-2">
          {messages.length === 0 ? (
            <p className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">No messages.</p>
          ) : (
            <ul className="divide-y divide-line">
              {messages.map((message) => (
                <li key={message.id}>
                  <Link href={`/admin/messages${buildQuery(base, { id: message.id })}`} className={cn("block px-5 py-3.5 hover:bg-canvas/60", selectedId === message.id && "bg-iris-50")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", message.status === "NEW" ? "font-semibold" : "font-medium")}>{message.subject}</span>
                      <StatusBadge label={LABEL[message.status]} tone={TONE[message.status]} />
                    </div>
                    <p className="mt-0.5 truncate text-[0.8125rem] text-ink-600">{message.name} · {message.email}</p>
                    <p className="text-[0.75rem] text-ink-400">{dateTime.format(message.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <AdminPagination basePath="/admin/messages" query={base} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} />
        </Card>
        <Card className="xl:col-span-3" title={selected ? selected.subject : "Select a message"}>
          {selected ? (
            <div>
              <p className="text-sm text-ink-600">
                From <span className="font-medium text-ink-950">{selected.name}</span> ·{" "}
                <a href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`} className="underline underline-offset-2">
                  {selected.email}
                </a>
                {selected.orderNumber && (
                  <>
                    {" "}
                    · Order <span className="tabular font-medium">{selected.orderNumber}</span>
                  </>
                )}
                <br />
                {dateTime.format(selected.createdAt)}
              </p>
              <p className="mt-5 whitespace-pre-line rounded-md bg-canvas p-4 text-[0.9375rem] leading-relaxed text-ink-800">{selected.message}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`} className="inline-flex h-9 items-center rounded-sm bg-ink-950 px-3.5 text-sm font-medium text-white hover:bg-ink-800">
                  Reply by email
                </a>
                {selected.status !== "IN_PROGRESS" && (
                  <ActionButton action={setMessageStatusAction.bind(null, selected.id, "IN_PROGRESS")}>Mark in progress</ActionButton>
                )}
                {selected.status !== "RESOLVED" && (
                  <ActionButton action={setMessageStatusAction.bind(null, selected.id, "RESOLVED")}>Mark resolved</ActionButton>
                )}
                {selected.status === "RESOLVED" && <ActionButton action={setMessageStatusAction.bind(null, selected.id, "NEW")}>Reopen</ActionButton>}
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-500">Choose a message from the list to read it.</p>
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
