import { CreditCard, Info, LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/admin/ui";
import { paymentProviderList } from "@/lib/env-value";

export const metadata: Metadata = { title: "Payments" };

const PROVIDER_LABELS: Record<string, string> = { stripe: "Card payments (Stripe)", paypal: "PayPal", cod: "Cash on delivery", sandbox: "Test payments (sandbox)" };

/** What customers can pay with today, and the status of owner payouts. Stated plainly: Stripe Connect is not live yet. */
export default function DashboardPaymentsPage() {
  const providers = paymentProviderList(process.env.PAYMENT_PROVIDERS);
  return (
    <>
      <PageHeader title="Payments" description="How your customers pay and how you get paid." />
      <div className="space-y-6">
        <Card title="Payment methods in your store">
          <ul className="space-y-2">
            {providers.map((provider) => (
              <li key={provider} className="flex items-center gap-3 text-[0.9375rem] text-ink-950">
                <CreditCard className="size-4 text-ink-500" aria-hidden />
                {PROVIDER_LABELS[provider] ?? provider}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.875rem] text-ink-600">These are set for the whole platform, so every store offers the same checkout options.</p>
        </Card>
        <Card title="Your own Stripe account">
          <div className="flex gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
            <div className="text-[0.9375rem] leading-relaxed text-ink-700">
              <p>
                <span className="font-medium text-ink-950">Not available yet.</span> Connecting your own Stripe account — so card payments land in your account and the wholesale cost is settled automatically — is being built now.
              </p>
              <p className="mt-2">Until it is live, Zendropship collects your customers&rsquo; payments and credits your margin to your balance, which you withdraw from the Balance page.</p>
            </div>
          </div>
        </Card>
        <Card title="Help with money questions">
          <p className="text-[0.9375rem] leading-relaxed text-ink-700">Deposits, withdrawals, a payment that looks wrong — the Zendropship team can look it up for you.</p>
          <a href="/contact" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink-950 underline decoration-ink-300 underline-offset-4">
            <LifeBuoy className="size-4" aria-hidden /> Contact Zendropship support
          </a>
        </Card>
      </div>
    </>
  );
}
