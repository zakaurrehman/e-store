import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AccountSection } from "@/components/store/account/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/misc";
import { getCustomerOverview } from "@/features/orders/queries";
import { ORDER_STATUS_LABELS, statusTone } from "@/features/orders/status";
import { requireUser } from "@/server/auth/guards";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

async function Overview({ searchParams }: PageProps<"/account">) {
  const [user, query] = await Promise.all([requireUser("/account"), searchParams]);
  const overview = await getCustomerOverview(user.id);
  const stats = [
    { label: "Orders", value: String(overview.orderCount), href: "/account/orders" },
    { label: "Total spent", value: formatMoney(overview.spendCents), href: "/account/orders" },
    { label: "Wishlist", value: String(overview.wishlistCount), href: "/account/wishlist" },
    { label: "Addresses", value: String(overview.addresses), href: "/account/addresses" },
  ];
  return (
    <div className="space-y-12">
      {query.welcome === "1" && (
        <Alert tone="success" title="Welcome to Zendropship">
          Your account is ready. We&rsquo;ve sent a confirmation link to {user.email} — confirm it to unlock reviews and order updates.
        </Alert>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <li key={stat.label}>
            <Link href={stat.href} className="block rounded-md border border-line p-4 transition-colors hover:border-ink-950">
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">{stat.label}</p>
              <p className="tabular mt-2 text-2xl font-semibold tracking-[-0.02em]">{stat.value}</p>
            </Link>
          </li>
        ))}
      </ul>
      <AccountSection title="Recent orders" action={overview.recent.length > 0 ? <Link href="/account/orders" className="text-sm font-medium underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">View all</Link> : undefined}>
        {overview.recent.length === 0 ? (
          <EmptyState title="No orders yet" description="When you place an order, it will show up here with live tracking." action={<ButtonLink href="/collections/new-arrivals">Start shopping</ButtonLink>} className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {overview.recent.map((order) => (
              <li key={order.id}>
                <Link href={`/account/orders/${order.number}`} className="flex items-center gap-4 py-4 hover:bg-canvas/60 sm:-mx-3 sm:rounded-md sm:px-3">
                  <div className="flex -space-x-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="relative size-12 overflow-hidden rounded-sm border-2 border-surface bg-canvas">
                        {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="tabular text-[0.9375rem] font-medium">{order.number}</p>
                    <p className="text-[0.8125rem] text-ink-500">
                      {dateFormat.format(order.placedAt)} · {formatMoney(order.totalCents, order.currency)}
                    </p>
                  </div>
                  <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AccountSection>
    </div>
  );
}

export default function AccountPage(props: PageProps<"/account">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Overview {...props} />
    </Suspense>
  );
}
