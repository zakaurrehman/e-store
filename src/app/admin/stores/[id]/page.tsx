import { ExternalLink, KeyRound, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProofThumbnail } from "@/components/admin/deposits/deposit-review";
import { CreditWallet } from "@/components/admin/stores/credit-wallet";
import { ActionButton } from "@/components/admin/forms";
import {
  Card,
  dateTime,
  DescriptionList,
  PageHeader,
  StatTile,
  StatusBadge,
  Table,
  TableEmpty,
  Td,
  Th,
} from "@/components/admin/ui";
import { StoreMark } from "@/components/store/header/store-brand";
import { Skeleton } from "@/components/ui/misc";
import {
  forcePasswordResetAction,
  setCustomerStatusAction,
} from "@/features/admin/customers";
import {
  DEPOSIT_STATUS_LABELS,
  DEPOSIT_STATUS_TONES,
} from "@/features/admin/deposits";
import { getStoreForAdmin } from "@/features/admin/stores";
import { ORDER_STATUS_LABELS, statusTone } from "@/features/orders/status";
import { setStoreStatusAction } from "@/features/stores/actions";
import { WALLET_ENTRY_LABELS } from "@/features/wallet/queries";
import { PayoutStatus } from "@/generated/prisma/enums";
import { storeUrl } from "@/lib/tenancy";
import { can, requirePagePermission } from "@/server/auth/guards";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Store" };

const PAYOUT_LABELS: Record<PayoutStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  PROCESSING: "Being sent",
  PAID: "Paid",
  REJECTED: "Declined",
};
const PAYOUT_TONES: Record<PayoutStatus, "warning" | "success" | "danger"> = {
  REQUESTED: "warning",
  APPROVED: "warning",
  PROCESSING: "warning",
  PAID: "success",
  REJECTED: "danger",
};

async function StoreDetail({ params }: PageProps<"/admin/stores/[id]">) {
  const [{ id }, viewer] = await Promise.all([
    params,
    requirePagePermission("stores.view", "/admin/stores"),
  ]);
  const detail = await getStoreForAdmin(id);
  if (!detail) notFound();
  const {
    store,
    summary,
    ledger,
    activity,
    conversations,
    salesCents,
    orderCount,
    invitation,
  } = detail;
  const owner = store.owner;
  const canManage = can(viewer, "stores.manage");
  const canResetOwner =
    can(viewer, "customers.update") && owner !== null && owner.id !== viewer.id;
  const address = storeUrl(store.slug);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Stores", href: "/admin/stores" },
          { label: store.name },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <StoreMark store={store} size={28} />
            {store.name}
            <StatusBadge
              label={store.status === "ACTIVE" ? "Open" : "Suspended"}
              tone={store.status === "ACTIVE" ? "success" : "danger"}
            />
          </span>
        }
        description={address.replace(/^https?:\/\//, "")}
        actions={
          <>
            <a
              href={address}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-3.5 text-[0.875rem] font-medium hover:border-ink-950"
            >
              <ExternalLink className="size-3.5" aria-hidden /> Visit store
            </a>
            {canManage &&
              owner &&
              (store.status === "SUSPENDED" ? (
                <ActionButton
                  action={setStoreStatusAction.bind(null, store.id, "ACTIVE")}
                  variant="primary"
                >
                  Reopen store
                </ActionButton>
              ) : (
                <ActionButton
                  action={setStoreStatusAction.bind(
                    null,
                    store.id,
                    "SUSPENDED",
                  )}
                  variant="danger"
                  confirm={{
                    title: `Suspend ${store.name}?`,
                    description:
                      "The store disappears for shoppers immediately. The owner can still sign in and reach support but cannot change the store until you reopen it.",
                    confirmLabel: "Suspend store",
                    destructive: true,
                  }}
                >
                  Suspend store
                </ActionButton>
              ))}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Wallet balance"
          value={formatMoney(summary.balanceCents)}
          hint={`${formatMoney(summary.availableCents)} available now`}
          href={`/admin/stores/${store.id}#ledger`}
        />
        <StatTile
          label="Orders"
          value={orderCount}
          hint={formatMoney(salesCents) + " sold"}
          href={`/admin/orders?store=${store.slug}`}
        />
        <StatTile
          label="Products"
          value={store._count.products}
          hint="On the shelf"
        />
        <StatTile
          label="Deposits pending"
          value={summary.pendingDepositCount}
          hint={
            summary.pendingDepositCount
              ? formatMoney(summary.pendingDepositCents) + " to review"
              : "Nothing waiting"
          }
          tone={summary.pendingDepositCount ? "warning" : "default"}
          href="/admin/deposits?status=PENDING"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card
            title="Deposits"
            description="What the owner says they have sent"
            padded={false}
            actions={
              <Link
                href={`/admin/deposits?q=${store.slug}`}
                className="text-[0.8125rem] text-ink-600 hover:text-ink-950"
              >
                All deposits
              </Link>
            }
          >
            <Table>
              <thead>
                <tr>
                  <Th>Submitted</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Details</Th>
                  <Th>Proof</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {store.deposits.length === 0 && (
                  <TableEmpty colSpan={5}>No deposits yet.</TableEmpty>
                )}
                {store.deposits.map((deposit) => (
                  <tr key={deposit.id} className="align-top">
                    <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">
                      {dateTime.format(deposit.createdAt)}
                    </Td>
                    <Td className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(deposit.amountCents)}
                    </Td>
                    <Td className="max-w-[12rem] text-[0.8125rem] text-ink-600">
                      <p className="font-medium text-ink-800">
                        {deposit.method === "CRYPTO"
                          ? (deposit.network ?? "Crypto")
                          : "Bank transfer"}
                      </p>
                      {deposit.reference && (
                        <p className="break-all font-mono text-[0.75rem]">
                          {deposit.reference}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <ProofThumbnail proof={deposit.proof} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <StatusBadge
                        label={DEPOSIT_STATUS_LABELS[deposit.status]}
                        tone={DEPOSIT_STATUS_TONES[deposit.status]}
                      />
                      {deposit.entries[0] && (
                        <p className="mt-1 text-[0.75rem] text-ink-500">
                          {formatMoney(deposit.entries[0].amountCents)} credited
                        </p>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div id="ledger" className="scroll-mt-24">
            <Card
              title="Wallet ledger"
              description="Every movement, newest first — nothing here is ever edited"
              padded={false}
            >
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Movement</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Balance after</Th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.length === 0 && (
                    <TableEmpty colSpan={4}>
                      Nothing on the ledger yet.
                    </TableEmpty>
                  )}
                  {ledger.entries.map((entry) => (
                    <tr key={entry.id}>
                      <Td className="whitespace-nowrap text-[0.875rem] text-ink-600">
                        {dateTime.format(entry.createdAt)}
                      </Td>
                      <Td>
                        <p className="text-[0.875rem] font-medium text-ink-900">
                          {WALLET_ENTRY_LABELS[entry.type]}
                        </p>
                        <p className="text-[0.75rem] text-ink-500">
                          {entry.description}
                          {/* Most descriptions name the order already. */}
                          {entry.order && !entry.description.includes(entry.order.number) ? ` · ${entry.order.number}` : ""}
                          {entry.createdBy
                            ? ` · by ${entry.createdBy.firstName} ${entry.createdBy.lastName}`
                            : ""}
                        </p>
                      </Td>
                      <Td
                        className={cn(
                          "tabular whitespace-nowrap text-right font-medium",
                          entry.amountCents < 0
                            ? "text-danger"
                            : "text-success",
                        )}
                      >
                        {entry.amountCents < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(entry.amountCents))}
                      </Td>
                      <Td className="tabular whitespace-nowrap text-right text-ink-600">
                        {entry.balanceAfterCents === null
                          ? "—"
                          : formatMoney(entry.balanceAfterCents)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card
            title="Orders"
            padded={false}
            actions={
              <Link
                href={`/admin/orders?store=${store.slug}`}
                className="text-[0.8125rem] text-ink-600 hover:text-ink-950"
              >
                All orders
              </Link>
            }
          >
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Owner earns</Th>
                </tr>
              </thead>
              <tbody>
                {store.orders.length === 0 && (
                  <TableEmpty colSpan={4}>No orders yet.</TableEmpty>
                )}
                {store.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-canvas/60">
                    <Td>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="tabular font-medium text-ink-950 hover:underline"
                      >
                        {order.number}
                      </Link>
                      <span className="block text-[0.75rem] text-ink-500">
                        {dateTime.format(order.placedAt)}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge
                        label={ORDER_STATUS_LABELS[order.status]}
                        tone={statusTone(order.status)}
                      />
                    </Td>
                    <Td className="tabular text-right font-medium">
                      {formatMoney(order.totalCents, order.currency)}
                    </Td>
                    <Td className="tabular text-right text-ink-600">
                      {formatMoney(order.ownerEarningCents, order.currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card
            title="Activity"
            description="What the owner and staff have done, newest first"
          >
            <ul className="divide-y divide-line text-sm">
              {activity.length === 0 && (
                <li className="py-3 text-ink-500">Nothing recorded yet.</li>
              )}
              {activity.map((entry) => (
                <li key={entry.id} className="py-2.5">
                  <p className="text-ink-900">{entry.summary}</p>
                  <p className="text-[0.75rem] text-ink-500">
                    {dateTime.format(entry.createdAt)} · {entry.action}
                    {entry.actor
                      ? ` · ${entry.actor.firstName} ${entry.actor.lastName}`
                      : ""}
                    {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Owner">
            {owner ? (
              <>
                <DescriptionList
                  items={[
                    {
                      label: "Name",
                      value: (
                        <Link
                          href={`/admin/customers/${owner.id}`}
                          className="font-medium hover:underline"
                        >
                          {owner.firstName} {owner.lastName}
                        </Link>
                      ),
                    },
                    {
                      label: "Email",
                      value: (
                        <a
                          href={`mailto:${owner.email}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Mail
                            className="size-3.5 shrink-0 text-ink-500"
                            aria-hidden
                          />{" "}
                          {owner.email}
                        </a>
                      ),
                    },
                    {
                      label: "Phone",
                      value: owner.phone ? (
                        <a
                          href={`tel:${owner.phone.replace(/[^\d+]/g, "")}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Phone
                            className="size-3.5 shrink-0 text-ink-500"
                            aria-hidden
                          />{" "}
                          {owner.phone}
                        </a>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      label: "Account",
                      value: owner.status === "ACTIVE" ? "Active" : "Disabled",
                    },
                    {
                      label: "Email verified",
                      value: owner.emailVerifiedAt
                        ? dateTime.format(owner.emailVerifiedAt)
                        : "Not yet",
                    },
                    {
                      label: "Joined",
                      value: dateTime.format(owner.createdAt),
                    },
                    {
                      label: "Last sign-in",
                      value: owner.lastLoginAt
                        ? dateTime.format(owner.lastLoginAt)
                        : "—",
                    },
                    ...(owner.mustResetPassword
                      ? [{ label: "Access", value: "Password reset required" }]
                      : []),
                  ]}
                />
                <div className="mt-4 border-t border-line pt-4">
                  <p className="flex gap-2 text-[0.8125rem] leading-relaxed text-ink-600">
                    <KeyRound
                      className="mt-0.5 size-3.5 shrink-0 text-ink-500"
                      aria-hidden
                    />
                    Passwords are stored only as a hash and can never be read or
                    shown. To get someone back in, send a reset link — it ends
                    their sessions and blocks sign-in until they set a new
                    password themselves.
                  </p>
                  {canResetOwner && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton
                        action={forcePasswordResetAction.bind(null, owner.id)}
                        confirm={{
                          title: "Send this owner a password reset?",
                          description: `${owner.email} is signed out everywhere and cannot sign in until they set a new password from the emailed link.`,
                          confirmLabel: "Send reset link",
                        }}
                      >
                        Send password reset
                      </ActionButton>
                      {owner.status === "ACTIVE" ? (
                        <ActionButton
                          action={setCustomerStatusAction.bind(
                            null,
                            owner.id,
                            "DISABLED",
                          )}
                          variant="ghost"
                          confirm={{
                            title: "Disable this owner's account?",
                            description:
                              "They are signed out everywhere and cannot sign in. The store and its history are kept.",
                            confirmLabel: "Disable",
                            destructive: true,
                          }}
                        >
                          Disable account
                        </ActionButton>
                      ) : (
                        <ActionButton
                          action={setCustomerStatusAction.bind(
                            null,
                            owner.id,
                            "ACTIVE",
                          )}
                          variant="ghost"
                        >
                          Re-enable account
                        </ActionButton>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-500">
                This is the platform&rsquo;s own store — it has no owner
                account.
              </p>
            )}
          </Card>

          <Card title="Store">
            <DescriptionList
              items={[
                {
                  label: "Address",
                  value: address.replace(/^https?:\/\//, ""),
                },
                { label: "Opened", value: dateTime.format(store.createdAt) },
                {
                  label: "Invitation",
                  value: invitation ? (
                    <span className="font-mono text-[0.8125rem]">
                      {invitation}
                    </span>
                  ) : (
                    "—"
                  ),
                },
                {
                  label: "Pricing",
                  value:
                    store.pricingMode === "MARKUP"
                      ? `Markup ${(store.markupBps / 100).toFixed(0)}%`
                      : "Suggested prices",
                },
                { label: "Currency", value: store.currency },
                { label: "Support email", value: store.supportEmail ?? "—" },
                { label: "Conversations", value: store._count.messages },
              ]}
            />
          </Card>

          <Card
            title="Money"
            actions={canManage && owner ? <CreditWallet storeId={store.id} storeName={store.name} balanceCents={summary.balanceCents} /> : undefined}
          >
            <DescriptionList
              items={[
                { label: "Balance", value: formatMoney(summary.balanceCents) },
                {
                  label: "Available",
                  value: formatMoney(summary.availableCents),
                },
                {
                  label: "On its way",
                  value: formatMoney(summary.pendingCents),
                },
                {
                  label: "Deposited",
                  value: formatMoney(summary.totalDepositedCents),
                },
                {
                  label: "Commission",
                  value: formatMoney(Math.abs(summary.commissionChargedCents)),
                },
                {
                  label: "Fulfilment",
                  value: formatMoney(Math.abs(summary.fulfilmentChargedCents)),
                },
                {
                  label: "Lifetime earnings",
                  value: formatMoney(summary.lifetimeEarningsCents),
                },
              ]}
            />
          </Card>

          <Card
            title="Support conversations"
            description="From this store's customers, and from its owner"
            padded={false}
            actions={
              <Link href={`/admin/messages?q=${store.slug}`} className="text-[0.8125rem] text-ink-600 hover:text-ink-950">
                Open inbox
              </Link>
            }
          >
            <ul className="divide-y divide-line px-5 text-sm">
              {conversations.length === 0 && <li className="py-3 text-ink-500">Nothing written yet.</li>}
              {conversations.map((conversation) => (
                <li key={conversation.id} className="py-2.5">
                  <Link href={`/admin/messages?id=${conversation.id}`} className="flex items-center gap-2 font-medium text-ink-950 hover:underline">
                    {conversation.unreadForStaff && <span className="size-1.5 shrink-0 rounded-full bg-iris-600" aria-label="Unread" />}
                    <span className="min-w-0 truncate">{conversation.subject}</span>
                  </Link>
                  <p className="text-[0.75rem] text-ink-500">
                    {conversation.storeId ? conversation.name : "To Zendropship"} · {dateTime.format(conversation.lastMessageAt)}
                    {conversation._count.replies > 0 ? ` · ${conversation._count.replies} repl${conversation._count.replies === 1 ? "y" : "ies"}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Withdrawals" padded={false}>
            <ul className="divide-y divide-line px-5 text-sm">
              {store.payouts.length === 0 && (
                <li className="py-3 text-ink-500">None requested.</li>
              )}
              {store.payouts.map((payout) => (
                <li
                  key={payout.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="tabular block font-medium">
                      {formatMoney(payout.amountCents)}
                    </span>
                    <span className="block text-[0.75rem] text-ink-500">
                      {dateTime.format(payout.createdAt)}
                    </span>
                  </span>
                  <StatusBadge
                    label={PAYOUT_LABELS[payout.status]}
                    tone={PAYOUT_TONES[payout.status]}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminStorePage(props: PageProps<"/admin/stores/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <StoreDetail {...props} />
    </Suspense>
  );
}
