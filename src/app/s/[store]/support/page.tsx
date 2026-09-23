import { LifeBuoy, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { SupportPulse } from "@/components/support/support-pulse";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { storeFromParams } from "@/features/stores/route";
import { listCustomerConversations, CUSTOMER_SUPPORT_STATUS_LABELS, CUSTOMER_SUPPORT_STATUS_TONES, supportPulseStamp } from "@/features/support/queries";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Customer service", robots: { index: false, follow: false } };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

async function Inbox({ params }: PageProps<"/s/[store]/support">) {
  const [store, user] = await Promise.all([storeFromParams(params), requireUser("/support")]);
  const conversations = await listCustomerConversations(user.id, store.id);

  const pulse = await supportPulseStamp(user);
  return (
    <>
      <SupportPulse stamp={pulse} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">Customer service</h1>
          <p className="mt-3 text-[1.0625rem] text-ink-600">Ask {store.name} about an order, a product or a return. Replies arrive here and by email.</p>
        </div>
        <ButtonLink href="/support/new">
          <MessageSquare className="size-4" aria-hidden /> New message
        </ButtonLink>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<LifeBuoy className="size-6" strokeWidth={1.5} />}
          title="No messages yet"
          description="When you write to us, the conversation appears here so you can follow it."
          action={<ButtonLink href="/support/new">Start a conversation</ButtonLink>}
        />
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link href={`/support/${conversation.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-ink-950">
                    <span className="truncate">{conversation.subject}</span>
                    {conversation.unreadForCustomer && <span className="shrink-0 rounded-full bg-iris-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">New reply</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[0.875rem] text-ink-600">{conversation.message}</p>
                  <p className="mt-1 text-[0.75rem] text-ink-500">
                    {dateTime.format(conversation.lastMessageAt)}
                    {conversation.orderNumber ? ` · order ${conversation.orderNumber}` : ""}
                    {conversation._count.replies > 0 ? ` · ${conversation._count.replies} repl${conversation._count.replies === 1 ? "y" : "ies"}` : ""}
                  </p>
                </div>
                <Badge tone={CUSTOMER_SUPPORT_STATUS_TONES[conversation.status]}>{CUSTOMER_SUPPORT_STATUS_LABELS[conversation.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function StoreSupportPage(props: PageProps<"/s/[store]/support">) {
  return (
    <div className="container-page pb-24 pt-6">
      <Breadcrumbs items={[{ name: "Customer service", href: "/support" }]} />
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Inbox {...props} />
        </Suspense>
      </div>
    </div>
  );
}
