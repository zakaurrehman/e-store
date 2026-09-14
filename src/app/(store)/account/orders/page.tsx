import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { AccountSection } from "@/components/store/account/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { listCustomerOrders } from "@/features/orders/queries";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, statusTone } from "@/features/orders/status";
import { requireUser } from "@/server/auth/guards";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

async function OrdersList({ searchParams }: PageProps<"/account/orders">) {
  const [user, query] = await Promise.all([requireUser("/account/orders"), searchParams]);
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const data = await listCustomerOrders(user.id, { page });
  return (
    <AccountSection title="Orders" description={data.total > 0 ? `${data.total} order${data.total === 1 ? "" : "s"}` : undefined}>
      {data.orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Your orders and their tracking will appear here." action={<ButtonLink href="/collections/new-arrivals">Start shopping</ButtonLink>} className="py-10" />
      ) : (
        <ul className="space-y-3">
          {data.orders.map((order) => (
            <li key={order.id} className="rounded-md border border-line p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="tabular font-medium">{order.number}</p>
                  <p className="text-[0.8125rem] text-ink-500">Placed {dateFormat.format(order.placedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={paymentTone(order.paymentStatus)}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
                  <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex -space-x-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="relative size-14 overflow-hidden rounded-sm border-2 border-surface bg-canvas">
                      {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-cover" />}
                    </div>
                  ))}
                  {order._count.items > 4 && <div className="flex size-14 items-center justify-center rounded-sm border-2 border-surface bg-canvas text-xs text-ink-600">+{order._count.items - 4}</div>}
                </div>
                <p className="line-clamp-1 flex-1 text-[0.9375rem] text-ink-700">{order.items.map((item) => item.productName).join(", ")}</p>
                <p className="tabular text-[0.9375rem] font-medium">{formatMoney(order.totalCents, order.currency)}</p>
              </div>
              <div className="mt-4 flex gap-2">
                <ButtonLink href={`/account/orders/${order.number}`} size="sm">
                  View order
                </ButtonLink>
                {order.status !== "CANCELLED" && order.status !== "DELIVERED" && (
                  <ButtonLink href={`/account/orders/${order.number}#tracking`} size="sm" variant="secondary">
                    Track
                  </ButtonLink>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.pageCount > 1 && (
        <nav className="mt-6 flex gap-2" aria-label="Order pages">
          {page > 1 && (
            <ButtonLink href={`/account/orders?page=${page - 1}`} variant="secondary" size="sm">
              Previous
            </ButtonLink>
          )}
          {page < data.pageCount && (
            <ButtonLink href={`/account/orders?page=${page + 1}`} variant="secondary" size="sm">
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </AccountSection>
  );
}

export default function OrdersPage(props: PageProps<"/account/orders">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <OrdersList {...props} />
    </Suspense>
  );
}
