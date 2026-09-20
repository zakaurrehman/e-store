import { CheckCircle2, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderView } from "@/components/store/orders/order-view";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { getOrderByAccessToken, getOrderForCustomer } from "@/features/orders/queries";
import { storeFromParams } from "@/features/stores/route";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function ConfirmationContent({ params, searchParams }: PageProps<"/s/[store]/checkout/confirmation/[number]">) {
  const [{ number }, query, store] = await Promise.all([params, searchParams, storeFromParams(params)]);
  const token = typeof query.token === "string" ? query.token : undefined;
  const user = await getCurrentUser();
  const order = (user ? await getOrderForCustomer(user.id, number, store.id) : null) ?? (await getOrderByAccessToken(number, token, store.id));
  if (!order) notFound();

  const paymentNotice = query.payment === "cancelled" ? "cancelled" : query.failed === "1" || order.paymentStatus === "FAILED" ? "failed" : null;
  const confirmed = order.status !== "PENDING" && order.status !== "CANCELLED";

  return (
    <>
      <div className="mb-10 max-w-2xl">
        {confirmed ? <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} aria-hidden /> : <Clock className="size-10 text-warning" strokeWidth={1.5} aria-hidden />}
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.025em] md:text-4xl">{confirmed ? "Thank you — your order is confirmed" : "Almost there"}</h1>
        <p className="mt-2 text-[1.0625rem] text-ink-600">
          Order <span className="tabular font-medium text-ink-950">{order.number}</span>
          {confirmed ? ` · a confirmation has been sent to ${order.email}.` : " is saved and waiting for payment."}
        </p>
        {!user && (
          <p className="mt-4 text-[0.9375rem] text-ink-600">
            Want to track this order without the email link?{" "}
            <Link href={`/register?next=${encodeURIComponent("/account/orders")}`} className="font-medium text-ink-950 underline underline-offset-4">
              Create an account
            </Link>{" "}
            with {order.email}.
          </p>
        )}
      </div>
      <OrderView order={order} accessToken={token} paymentNotice={paymentNotice} />
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/collections/new-arrivals">Continue shopping</ButtonLink>
        {user && (
          <ButtonLink href="/account/orders" variant="secondary">
            View all orders
          </ButtonLink>
        )}
      </div>
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
