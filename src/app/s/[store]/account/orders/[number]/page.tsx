import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderView } from "@/components/store/orders/order-view";
import { Skeleton } from "@/components/ui/misc";
import { getOrderForCustomer } from "@/features/orders/queries";
import { storeFromParams } from "@/features/stores/route";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

async function OrderDetail({ params }: PageProps<"/s/[store]/account/orders/[number]">) {
  const [{ number }, user, store] = await Promise.all([params, requireUser("/account/orders"), storeFromParams(params)]);
  const order = await getOrderForCustomer(user.id, number, store.id);
  if (!order) notFound();
  return (
    <div>
      <Link href="/account/orders" className="text-sm text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
        ← All orders
      </Link>
      <div className="mb-8 mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Order {order.number}</h2>
          <p className="text-[0.9375rem] text-ink-500">Placed {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(order.placedAt)}</p>
        </div>
      </div>
      <div id="tracking">
        <OrderView order={order} />
      </div>
    </div>
  );
}

export default function OrderDetailPage(props: PageProps<"/s/[store]/account/orders/[number]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <OrderDetail {...props} />
    </Suspense>
  );
}
