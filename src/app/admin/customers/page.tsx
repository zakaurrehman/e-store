import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPagination, buildQuery, Card, dateOnly, FilterLink, PageHeader, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import type { Prisma } from "@/generated/prisma/client";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Customers" };
const PAGE_SIZE = 25;

async function Customers({ searchParams }: PageProps<"/admin/customers">) {
  const [, query] = await Promise.all([requirePagePermission("customers.view", "/admin/customers"), searchParams]);
  const str = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const page = Math.max(1, Number(str("page") ?? 1) || 1);
  const where: Prisma.UserWhereInput = { deletedAt: null, ...(str("staff") === "1" ? { role: { isStaff: true } } : { role: { key: "CUSTOMER" } }) };
  if (str("q")) where.OR = [{ email: { contains: str("q"), mode: "insensitive" } }, { firstName: { contains: str("q"), mode: "insensitive" } }, { lastName: { contains: str("q"), mode: "insensitive" } }, { phone: { contains: str("q") } }];
  if (str("status") === "disabled") where.status = "DISABLED";
  const [total, users, spend] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { role: { select: { name: true, isStaff: true } }, _count: { select: { orders: true } } } }),
    db.order.groupBy({ by: ["userId"], where: { userId: { not: null }, paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, _sum: { totalCents: true } }),
  ]);
  const spendBy = new Map(spend.map((row) => [row.userId, row._sum.totalCents ?? 0]));
  const base = query as Record<string, string | string[] | undefined>;
  return (
    <>
      <PageHeader title="Customers" description={`${total.toLocaleString("en-US")} accounts`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={`/admin/customers${buildQuery(base, { staff: null, status: null, page: null })}`} active={!str("staff") && !str("status")}>
          Customers
        </FilterLink>
        <FilterLink href={`/admin/customers${buildQuery(base, { status: "disabled", staff: null, page: null })}`} active={str("status") === "disabled"}>
          Disabled
        </FilterLink>
        <FilterLink href={`/admin/customers${buildQuery(base, { staff: "1", status: null, page: null })}`} active={str("staff") === "1"}>
          Staff
        </FilterLink>
      </div>
      <Card padded={false}>
        <form className="flex gap-2 border-b border-line px-5 py-3" method="get">
          {str("staff") && <input type="hidden" name="staff" value="1" />}
          <Input name="q" defaultValue={str("q") ?? ""} placeholder="Search name, email or phone" className="h-9 max-w-sm" aria-label="Search customers" />
          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Status</Th>
              <Th className="text-right">Orders</Th>
              <Th className="text-right">Spent</Th>
              <Th>Joined</Th>
              <Th>Last sign-in</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <TableEmpty colSpan={6}>No customers match.</TableEmpty>}
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-canvas/60">
                <Td>
                  <Link href={`/admin/customers/${user.id}`} className="font-medium text-ink-950 hover:underline">
                    {user.firstName} {user.lastName}
                  </Link>
                  <span className="block text-[0.75rem] text-ink-500">
                    {user.email}
                    {user.role.isStaff && ` · ${user.role.name}`}
                  </span>
                </Td>
                <Td>
                  <StatusBadge label={user.status === "ACTIVE" ? (user.emailVerifiedAt ? "Active" : "Unverified") : "Disabled"} tone={user.status === "ACTIVE" ? (user.emailVerifiedAt ? "success" : "warning") : "danger"} />
                </Td>
                <Td className="tabular text-right">{user._count.orders}</Td>
                <Td className="tabular text-right">{formatMoney(spendBy.get(user.id) ?? 0)}</Td>
                <Td className="whitespace-nowrap text-ink-600">{dateOnly.format(user.createdAt)}</Td>
                <Td className="whitespace-nowrap text-ink-600">{user.lastLoginAt ? dateOnly.format(user.lastLoginAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <AdminPagination basePath="/admin/customers" query={base} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} />
      </Card>
    </>
  );
}

export default function CustomersPage(props: PageProps<"/admin/customers">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Customers {...props} />
    </Suspense>
  );
}
