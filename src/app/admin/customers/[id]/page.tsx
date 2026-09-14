import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/forms";
import { Card, dateTime, DescriptionList, PageHeader, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { forcePasswordResetAction, setCustomerStatusAction } from "@/features/admin/customers";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, paymentTone, statusTone } from "@/features/orders/status";
import { formatAddressLines } from "@/lib/address";
import { can, requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Customer" };

async function Customer({ params }: PageProps<"/admin/customers/[id]">) {
  const [{ id }, viewer] = await Promise.all([params, requirePagePermission("customers.view", "/admin/customers")]);
  const user = await db.user.findUnique({
    where: { id },
    include: {
      role: true,
      addresses: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      orders: { orderBy: { placedAt: "desc" }, take: 20, include: { _count: { select: { items: true } } } },
      reviews: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5, include: { product: { select: { name: true, slug: true } } } },
      sessions: { where: { expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" }, take: 5 },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 15 },
      wishlist: { select: { _count: { select: { items: true } } } },
      _count: { select: { orders: true } },
    },
  });
  if (!user) notFound();
  const spend = await db.order.aggregate({ where: { userId: id, paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, _sum: { totalCents: true }, _count: { _all: true } });
  const canUpdate = can(viewer, "customers.update") && viewer.id !== user.id;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Customers", href: "/admin/customers" }, { label: `${user.firstName} ${user.lastName}` }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user.firstName} {user.lastName}
            <StatusBadge label={user.status === "ACTIVE" ? "Active" : "Disabled"} tone={user.status === "ACTIVE" ? "success" : "danger"} />
            {user.role.isStaff && <StatusBadge label={user.role.name} tone="iris" />}
          </span>
        }
        description={user.email}
        actions={
          canUpdate ? (
            <>
              <ActionButton action={forcePasswordResetAction.bind(null, user.id)} confirm={{ title: "Reset this customer's access?", description: "Their sessions end immediately and they receive a password reset email. They can't sign in until they set a new password.", confirmLabel: "Send reset link" }}>
                Reset access
              </ActionButton>
              {user.status === "ACTIVE" ? (
                <ActionButton action={setCustomerStatusAction.bind(null, user.id, "DISABLED")} confirm={{ title: "Disable this account?", description: "They will be signed out everywhere and unable to sign in. Orders and history are kept.", confirmLabel: "Disable", destructive: true }} variant="danger">
                  Disable account
                </ActionButton>
              ) : (
                <ActionButton action={setCustomerStatusAction.bind(null, user.id, "ACTIVE")} variant="primary">
                  Re-enable account
                </ActionButton>
              )}
            </>
          ) : undefined
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Orders", value: String(spend._count._all) },
              { label: "Total spent", value: formatMoney(spend._sum.totalCents ?? 0) },
              { label: "Average order", value: spend._count._all ? formatMoney(Math.round((spend._sum.totalCents ?? 0) / spend._count._all)) : "—" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">{stat.label}</p>
                <p className="tabular mt-1.5 text-xl font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>
          <Card title="Orders" padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {user.orders.length === 0 && <TableEmpty colSpan={4}>No orders yet.</TableEmpty>}
                {user.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-canvas/60">
                    <Td>
                      <Link href={`/admin/orders/${order.id}`} className="tabular font-medium text-ink-950 hover:underline">
                        {order.number}
                      </Link>
                      <span className="block text-[0.75rem] text-ink-500">
                        {dateTime.format(order.placedAt)} · {order._count.items} item{order._count.items === 1 ? "" : "s"}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={statusTone(order.status)} />
                    </Td>
                    <Td>
                      <StatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} />
                    </Td>
                    <Td className="tabular text-right font-medium">{formatMoney(order.totalCents, order.currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card title="Activity" description="Account events and staff actions">
            <ul className="divide-y divide-line text-sm">
              {user.auditLogs.length === 0 && <li className="py-3 text-ink-500">No activity recorded.</li>}
              {user.auditLogs.map((entry) => (
                <li key={entry.id} className="py-2.5">
                  <p className="text-ink-900">{entry.summary}</p>
                  <p className="text-[0.75rem] text-ink-500">
                    {dateTime.format(entry.createdAt)} · {entry.action}
                    {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Profile">
            <DescriptionList
              items={[
                { label: "Email", value: user.email },
                { label: "Verified", value: user.emailVerifiedAt ? dateTime.format(user.emailVerifiedAt) : "Not yet" },
                { label: "Phone", value: user.phone ?? "—" },
                { label: "Marketing", value: user.marketingOptIn ? "Opted in" : "Not subscribed" },
                { label: "Joined", value: dateTime.format(user.createdAt) },
                { label: "Last sign-in", value: user.lastLoginAt ? dateTime.format(user.lastLoginAt) : "—" },
                { label: "Sessions", value: `${user.sessions.length} active` },
                { label: "Wishlist", value: `${user.wishlist?._count.items ?? 0} items` },
                ...(user.mustResetPassword ? [{ label: "Access", value: "Password reset required" }] : []),
              ]}
            />
          </Card>
          <Card title="Addresses">
            {user.addresses.length === 0 ? (
              <p className="text-sm text-ink-500">No saved addresses.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {user.addresses.map((address) => (
                  <li key={address.id} className="rounded-sm bg-canvas px-3 py-2 leading-relaxed text-ink-800">
                    {address.isDefaultShipping && <span className="mb-1 block text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">Default</span>}
                    {formatAddressLines(address).join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent reviews">
            {user.reviews.length === 0 ? (
              <p className="text-sm text-ink-500">No reviews.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {user.reviews.map((review) => (
                  <li key={review.id}>
                    <p className="font-medium">
                      {review.rating}★ · {review.product.name}
                    </p>
                    <p className="line-clamp-2 text-ink-600">{review.title}</p>
                    <p className="text-[0.75rem] text-ink-500">{review.status.toLowerCase()}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function CustomerPage(props: PageProps<"/admin/customers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Customer {...props} />
    </Suspense>
  );
}
