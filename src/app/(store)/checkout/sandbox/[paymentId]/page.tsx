import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { db } from "@/server/db";
import { orderAccessToken } from "@/server/notifications";
import { getPaymentProvider } from "@/server/payments/registry";
import type { SandboxProvider } from "@/server/payments/providers/sandbox";
import { formatMoney } from "@/utils/money";
import { sandboxDecisionAction } from "./actions";

export const metadata: Metadata = { title: "Test payment", robots: { index: false, follow: false } };

/**
 * Simulated hosted payment page. The outcome is delivered to the store through the signed sandbox
 * webhook — exactly like a real provider — so the checkout's trust boundary is exercised end to end.
 */
async function SandboxContent({ params, searchParams }: PageProps<"/checkout/sandbox/[paymentId]">) {
  const [{ paymentId }, query] = await Promise.all([params, searchParams]);
  const provider = getPaymentProvider("sandbox") as SandboxProvider | null;
  if (!provider) notFound();
  const signature = typeof query.sig === "string" ? query.sig : null;
  if (!provider.verifyPageSignature(paymentId, signature)) notFound();

  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment || !payment.providerReference) notFound();
  const { order } = payment;
  if (payment.status === "PAID") redirect(`/checkout/confirmation/${order.number}?token=${orderAccessToken(order)}`);

  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-md rounded-lg border border-line p-8">
        <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-500">Sandbox gateway</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Test payment</h1>
        <Alert tone="info" className="mt-4">
          This is a simulated payment page for testing. No real money moves. Choose an outcome and the store will receive it through a signed webhook.
        </Alert>
        <dl className="tabular mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Merchant</dt>
            <dd>Veyora</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Order</dt>
            <dd>{order.number}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>Amount</dt>
            <dd>{formatMoney(payment.amountCents, payment.currency)}</dd>
          </div>
        </dl>
        <form action={sandboxDecisionAction} className="mt-8 space-y-3">
          <input type="hidden" name="paymentId" value={paymentId} />
          <input type="hidden" name="sig" value={signature ?? ""} />
          <Button type="submit" name="outcome" value="succeeded" fullWidth size="lg">
            Pay {formatMoney(payment.amountCents, payment.currency)}
          </Button>
          <Button type="submit" name="outcome" value="failed" variant="secondary" fullWidth>
            Simulate a declined card
          </Button>
          <a href={`/checkout/return/sandbox?order=${order.number}&payment=${paymentId}&cancelled=1`} className="block text-center text-sm text-ink-500 underline underline-offset-4">
            Cancel and return to the store
          </a>
        </form>
      </div>
    </div>
  );
}

export default function SandboxPage(props: PageProps<"/checkout/sandbox/[paymentId]">) {
  return (
    <Suspense fallback={null}>
      <SandboxContent {...props} />
    </Suspense>
  );
}
