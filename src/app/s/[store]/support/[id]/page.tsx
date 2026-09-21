import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CustomerReplyForm } from "@/components/store/support/support-forms";
import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/misc";
import { storeFromParams } from "@/features/stores/route";
import { markCustomerConversationReadAction } from "@/features/support/actions";
import { getCustomerConversation, CUSTOMER_SUPPORT_STATUS_LABELS, CUSTOMER_SUPPORT_STATUS_TONES } from "@/features/support/queries";
import { requireUser } from "@/server/auth/guards";
import { cn } from "@/utils/cn";

export const metadata: Metadata = { title: "Customer service", robots: { index: false, follow: false } };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

async function Thread({ params, searchParams }: PageProps<"/s/[store]/support/[id]">) {
  const [store, { id }, query, user] = await Promise.all([storeFromParams(params), params, searchParams, requireUser("/support")]);
  const conversation = await getCustomerConversation(user.id, store.id, id);
  if (!conversation) notFound();
  // Opening the thread is what marks it read.
  await markCustomerConversationReadAction(conversation.id);

  const turns = [
    { id: "first", from: "customer" as const, body: conversation.message, at: conversation.createdAt, author: conversation.name },
    ...conversation.replies.map((reply) => ({
      id: reply.id,
      from: reply.isFromCustomer ? ("customer" as const) : ("store" as const),
      body: reply.body,
      at: reply.createdAt,
      author: reply.isFromCustomer ? conversation.name : (reply.author?.firstName ?? store.name),
    })),
  ];

  return (
    <>
      <Link href="/support" className="inline-flex items-center gap-1.5 text-[0.875rem] text-ink-600 hover:text-ink-950">
        <ArrowLeft className="size-4" aria-hidden /> All messages
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-[-0.025em]">{conversation.subject}</h1>
          <p className="mt-2 text-[0.9375rem] text-ink-600">
            Opened {dateTime.format(conversation.createdAt)}
            {conversation.order ? (
              <>
                {" · "}
                <Link href={`/account/orders/${conversation.order.number}`} className="underline underline-offset-4">
                  order {conversation.order.number}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <Badge tone={CUSTOMER_SUPPORT_STATUS_TONES[conversation.status]}>{CUSTOMER_SUPPORT_STATUS_LABELS[conversation.status]}</Badge>
      </div>

      {query.sent === "1" && (
        <Alert tone="success" title="Message sent" className="mt-6">
          We have your message and will reply within one business day.
        </Alert>
      )}

      <ol className="mt-8 space-y-4">
        {turns.map((turn) => (
          <li key={turn.id} className={cn("flex", turn.from === "customer" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[42rem] rounded-lg px-4 py-3", turn.from === "customer" ? "bg-ink-950 text-white" : "border border-line bg-surface")}>
              <p className={cn("text-[0.75rem] font-medium", turn.from === "customer" ? "text-white/70" : "text-ink-500")}>
                {turn.from === "customer" ? "You" : turn.author} · {dateTime.format(turn.at)}
              </p>
              <p className={cn("mt-1 whitespace-pre-line text-[0.9375rem] leading-relaxed", turn.from === "customer" ? "text-white" : "text-ink-800")}>{turn.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-lg border border-line p-5">
        {conversation.status === "RESOLVED" && (
          <p className="mb-4 flex items-center gap-2 text-[0.875rem] text-success">
            <CheckCircle2 className="size-4" aria-hidden /> Marked resolved. Writing again reopens it.
          </p>
        )}
        <CustomerReplyForm messageId={conversation.id} />
      </div>
    </>
  );
}

export default function SupportThreadPage(props: PageProps<"/s/[store]/support/[id]">) {
  return (
    <div className="container-page pb-24 pt-6">
      <Breadcrumbs items={[{ name: "Customer service", href: "/support" }, { name: "Conversation", href: "#" }]} />
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Thread {...props} />
        </Suspense>
      </div>
    </div>
  );
}
