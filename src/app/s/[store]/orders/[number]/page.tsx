import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { OrderView } from "@/components/store/orders/order-view";
import { Skeleton } from "@/components/ui/misc";
import { getOrderByAccessToken, getOrderForCustomer } from "@/features/orders/queries";
import { storeFromParams } from "@/features/stores/route";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Guest order page reached from emails / order tracker (signed access token). */
async function GuestOrderContent({ params, searchParams }: PageProps<"/s/[store]/orders/[number]">) {
  const [{ number }, query, store] = await Promise.all([params, searchParams, storeFromParams(params)]);
  const token = typeof query.token === "string" ? query.token : undefined;
  const user = await getCurrentUser();
  const order = (user ? await getOrderForCustomer(user.id, number, store.id) : null) ?? (await getOrderByAccessToken(number, token, store.id));
  if (!order) notFound();
  return (
    <>
      <Breadcrumbs items={[{ name: "Track order", href: "/track-order" }, { name: order.number, href: `/orders/${order.number}` }]} />
      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.025em] md:text-4xl">Order {order.number}</h1>
      <p className="mt-1 text-[0.9375rem] text-ink-500">Placed {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(order.placedAt)}</p>
      <div className="mt-8">
        <OrderView order={order} accessToken={token} />
      </div>
    </>
  );
}

export default function GuestOrderPage(props: PageProps<"/s/[store]/orders/[number]">) {
  return (
    <div className="container-page pb-20 pt-6">
      <Suspense fallback={<Skeleton className="h-64" />}>
        <GuestOrderContent {...props} />
      </Suspense>
    </div>
  );
}
