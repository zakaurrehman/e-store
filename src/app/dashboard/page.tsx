import { ArrowRight, BellRing, CheckCircle2, Circle, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, StatTile } from "@/components/admin/ui";
import { CopyLink } from "@/components/dashboard/controls";
import { BalancePanel } from "@/components/dashboard/wallet";
import { Alert, Skeleton } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { formatRate } from "@/features/finance/order-finance";
import { getStoreStats } from "@/features/stores/dashboard";
import { getStoreSettings } from "@/features/settings/queries";
import { requireStoreOwner } from "@/features/stores/guards";
import { getWalletSummary } from "@/features/wallet/queries";
import { MIN_DEPOSIT_CENTS, MIN_PAYOUT_CENTS } from "@/features/wallet/service";
import { storeUrl } from "@/lib/tenancy";
import { env } from "@/server/env";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Overview" };

async function Overview({ searchParams }: PageProps<"/dashboard">) {
  const [{ user, store }, query] = await Promise.all([requireStoreOwner("/dashboard"), searchParams]);
  const [stats, wallet, settings] = await Promise.all([getStoreStats(store.id), getWalletSummary(store.id), getStoreSettings()]);
  const commissionRate = settings.platform.commissionRateBps;
  const url = storeUrl(store.slug);
  const emailLive = env.EMAIL_DRIVER !== "log";

  const checklist = [
    { done: true, label: "Open your store", href: null },
    { done: stats.activeProducts > 0, label: "Add products from the catalogue", href: "/catalog" },
    { done: !!store.logo, label: "Upload your logo", href: "/dashboard/design" },
    { done: !!store.heroImage || (!!store.heroTitle && store.heroTitle !== store.name), label: "Personalise your homepage", href: "/dashboard/design" },
    { done: user.emailVerified, label: "Confirm your email address", href: null },
  ];
  const remaining = checklist.filter((item) => !item.done).length;

  const automation = [
    { icon: PackageCheck, title: "Order routing", text: "New orders go straight to Zendropship fulfilment.", live: true },
    { icon: RefreshCw, title: "Stock & price sync", text: "Your store shows live stock and catalogue prices.", live: true },
    { icon: BellRing, title: "Customer emails", text: emailLive ? "Order, shipping and delivery emails go out in your store's name." : "Order emails are recorded but not delivered until email sending is configured on the platform.", live: emailLive },
    { icon: ShieldCheck, title: "Checkout & accounts", text: "Customers can pay, create accounts and track orders in your store.", live: true },
  ];

  return (
    <>
      {query.welcome === "1" && (
        <Alert tone="success" title={`${store.name} is live`} className="mb-6">
          Your store is open at <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium underline">{url.replace(/^https?:\/\//, "")}</a>. Add products from the catalogue and they appear in your store straight away.
        </Alert>
      )}
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Here is how your store is doing."
        actions={
          <>
            <CopyLink url={url} />
            <ButtonLink href={url} target="_blank" rel="noopener noreferrer" size="sm">
              Visit store
            </ButtonLink>
          </>
        }
      />

      <BalancePanel summary={wallet} minimumPayoutCents={MIN_PAYOUT_CENTS} minimumDepositCents={MIN_DEPOSIT_CENTS} supportEmail={store.supportEmail} depositDetails={settings.deposits} />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Products live" value={stats.activeProducts} hint={stats.hiddenProducts ? `${stats.hiddenProducts} hidden` : undefined} href="/dashboard/products" />
        <StatTile label="Orders" value={stats.orders} hint={`${stats.recentOrders} in the last 30 days`} href="/dashboard/orders" />
        <StatTile label="Customer sales" value={formatMoney(stats.revenueCents)} hint={`${stats.customers} customer${stats.customers === 1 ? "" : "s"}`} href="/dashboard/orders" />
        <StatTile label="Your earnings" value={formatMoney(stats.earningsCents)} hint="After wholesale and commission" href="/dashboard/balance" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Orders" description="Where your orders are right now.">
          <ul className="divide-y divide-line">
            {[
              { label: "Awaiting payment", value: stats.byStatus.pendingPayment, href: "/dashboard/orders?status=PENDING", tone: "" },
              { label: "Waiting for you to accept", value: stats.byStatus.toAccept, href: "/dashboard/orders?status=TO_ACCEPT", tone: "text-warning", hint: "Nothing is fulfilled until you accept it" },
              { label: "With fulfilment", value: stats.byStatus.withFulfilment, href: "/dashboard/orders?status=PROCESSING", tone: "" },
              { label: "Shipped", value: stats.byStatus.shipped, href: "/dashboard/orders?status=SHIPPED", tone: "" },
              { label: "Delivered", value: stats.byStatus.delivered, href: "/dashboard/orders?status=DELIVERED", tone: "text-success" },
            ].map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={row.href} className={cn("text-[0.9375rem] hover:underline", row.tone || "text-ink-800")}>
                    {row.label}
                  </Link>
                  {row.hint && row.value > 0 && <p className="text-[0.75rem] text-ink-500">{row.hint}</p>}
                </div>
                <span className={cn("tabular text-lg font-semibold", row.value > 0 ? row.tone || "text-ink-950" : "text-ink-300")}>{row.value}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Where the money goes" description={`Across every order in your store.${commissionRate > 0 ? ` Zendropship's commission is ${formatRate(commissionRate)}.` : ""}`}>
          <dl className="divide-y divide-line">
            {[
              { label: "Customers paid", value: stats.revenueCents, hint: "Shipping and tax included", tone: "text-ink-950" },
              { label: "Goods sold", value: stats.goodsSoldCents, hint: "After discounts — what commission is charged on", tone: "text-ink-950" },
              { label: "Fulfilment cost", value: -stats.fulfilmentCostCents, hint: "Wholesale, charged to your balance", tone: "text-ink-700" },
              { label: "Zendropship commission", value: -stats.commissionCents, hint: commissionRate > 0 ? `${formatRate(commissionRate)} of goods sold` : "No commission is charged", tone: "text-ink-700" },
              { label: "Your earnings", value: stats.earningsCents, hint: "Credited as each payment is collected", tone: "text-success" },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <dt className="text-[0.9375rem] text-ink-800">{row.label}</dt>
                  <p className="text-[0.75rem] text-ink-500">{row.hint}</p>
                </div>
                <dd className={cn("tabular text-[0.9375rem] font-semibold", row.tone)}>{row.value < 0 ? `−${formatMoney(Math.abs(row.value))}` : formatMoney(row.value)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={remaining === 0 ? "Your store is set up" : `Finish setting up · ${remaining} to go`}>
          <ul className="space-y-1">
            {checklist.map((item) => (
              <li key={item.label}>
                {item.href && !item.done ? (
                  <Link href={item.href} className="group flex items-center gap-3 rounded-sm px-2 py-2 hover:bg-canvas">
                    <Circle className="size-5 text-line-strong" aria-hidden />
                    <span className="flex-1 text-[0.9375rem] text-ink-950">{item.label}</span>
                    <ArrowRight className="size-4 text-ink-400 group-hover:text-ink-950" aria-hidden />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">
                    {item.done ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <Circle className="size-5 text-line-strong" aria-hidden />}
                    <span className={cn("text-[0.9375rem]", item.done ? "text-ink-500 line-through decoration-ink-300" : "text-ink-950")}>{item.label}</span>
                    {!item.done && item.label.startsWith("Confirm") && <span className="text-[0.8125rem] text-ink-500">— check your inbox</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Running automatically">
          <ul className="space-y-4">
            {automation.map((item) => (
              <li key={item.title} className="flex gap-3">
                <item.icon className="mt-0.5 size-5 shrink-0 text-ink-950" strokeWidth={1.6} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[0.9375rem] font-medium text-ink-950">
                    {item.title}
                    <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", item.live ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{item.live ? "On" : "Waiting for setup"}</span>
                  </p>
                  <p className="mt-0.5 text-[0.875rem] text-ink-600">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
          {stats.openOrders > 0 && (
            <p className="mt-5 border-t border-line pt-4 text-[0.875rem] text-ink-600">
              {stats.openOrders} order{stats.openOrders === 1 ? " is" : "s are"} with fulfilment right now.{" "}
              <Link href="/dashboard/orders" className="text-ink-950 underline underline-offset-4">
                Track them
              </Link>
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      }
    >
      <Overview {...props} />
    </Suspense>
  );
}
