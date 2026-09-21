import { CheckCircle2, Clock, LifeBuoy, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderView } from "@/components/store/orders/order-view";
import { StoreBrand } from "@/components/store/header/store-brand";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { getOrderByAccessToken, getOrderForCustomer } from "@/features/orders/queries";
import { CUSTOMER_STATUS_LABELS } from "@/features/orders/status";
import { storeFromParams } from "@/features/stores/route";
import { getCurrentUser } from "@/server/auth/session";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Where checkout lands. The order is read from the database — never from client state — using the signed
 * token in the URL for guests or the session for signed-in customers, so a refresh, a back button or a
 * link opened later all show the same page instead of a 404.
 */
async function ConfirmationContent({ params, searchParams }: PageProps<"/s/[store]/checkout/confirmation/[number]">) {
  const [{ number }, query, store] = await Promise.all([params, searchParams, storeFromParams(params)]);
  const token = typeof query.token === "string" ? query.token : undefined;
  const user = await getCurrentUser();
  const order = (user ? await getOrderForCustomer(user.id, number, store.id) : null) ?? (await getOrderByAccessToken(number, token, store.id));
  if (!order) notFound();

  const paymentNotice = query.payment === "cancelled" ? "cancelled" : query.failed === "1" || order.paymentStatus === "FAILED" ? "failed" : null;
  const confirmed = order.status !== "PENDING" && order.status !== "CANCELLED";
  const trackHref = user ? `/account/orders/${order.number}` : `/orders/${order.number}${token ? `?token=${token}` : ""}`;

  return (
    <>
      <div className="mb-10 max-w-2xl">
        <StoreBrand store={store} className="mb-6" height={28} />
        {confirmed ? <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} aria-hidden /> : <Clock className="size-10 text-warning" strokeWidth={1.5} aria-hidden />}
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.025em] md:text-4xl">{confirmed ? "Thank you for your order!" : "Almost there"}</h1>
        <p className="mt-2 text-[1.0625rem] text-ink-600">
          Order <span className="tabular font-medium text-ink-950">{order.number}</span>
          {confirmed ? ` has been placed. A confirmation has been sent to ${order.email}.` : " is saved and waiting for payment."}
        </p>
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 rounded-lg border border-line bg-canvas px-5 py-4">
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Amount paid</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-ink-950">{formatMoney(order.totalCents, order.currency)}</dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Status</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink-950">{CUSTOMER_STATUS_LABELS[order.status]}</dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Items</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-ink-950">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={trackHref}>
            <Package className="size-4" aria-hidden /> Track your order
          </ButtonLink>
          <ButtonLink href="/collections/new-arrivals" variant="secondary">
            Continue shopping
          </ButtonLink>
          <ButtonLink href={`/support/new?order=${order.number}`} variant="ghost">
            <LifeBuoy className="size-4" aria-hidden /> Customer service
          </ButtonLink>
        </div>
        {!user && (
          <p className="mt-6 text-[0.9375rem] text-ink-600">
            Keep this link to come back to your order, or{" "}
            <Link href={`/register?next=${encodeURIComponent("/account/orders")}`} className="font-medium text-ink-950 underline underline-offset-4">
              create an account
            </Link>{" "}
            with {order.email} to see it any time.
          </p>
        )}
      </div>
      <OrderView order={order} accessToken={token} paymentNotice={paymentNotice} />
    </>
  );
}

export default function ConfirmationPage(props: PageProps<"/s/[store]/checkout/confirmation/[number]">) {
  return (
    <div className="container-page pb-20 pt-10">
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy>
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        <ConfirmationContent {...props} />
      </Suspense>
    </div>
  );
}
