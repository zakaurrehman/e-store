import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPagination, Card, PageHeader, StatTile, Table, TableEmpty, Td, Th, dateOnly } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { listStoreCustomers } from "@/features/stores/dashboard";
import { requireStoreOwner } from "@/features/stores/guards";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

async function Customers({ searchParams }: PageProps<"/dashboard/customers">) {
  const [{ store }, query] = await Promise.all([requireStoreOwner("/dashboard/customers"), searchParams]);
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const data = await listStoreCustomers(store.id, { page, pageSize: PAGE_SIZE });
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:max-w-xl">
        <StatTile label="Customers who ordered" value={data.total} />
        <StatTile label="Accounts created in your store" value={data.signups} />
      </div>
      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th className="text-right">Orders</Th>
              <Th className="text-right">Spent</Th>
              <Th>Last order</Th>
            </tr>
          </thead>
          <tbody>
            {data.customers.length === 0 && <TableEmpty colSpan={4}>No customers yet. They appear here after their first order.</TableEmpty>}
            {data.customers.map((customer) => (
              <tr key={customer.email}>
                <Td>
                  <p className="font-medium text-ink-950">{customer.name ?? customer.email}</p>
                  {customer.name && <p className="text-[0.8125rem] text-ink-500">{customer.email}</p>}
                </Td>
                <Td className="tabular text-right">{customer.orders}</Td>
                <Td className="tabular text-right">{formatMoney(customer.spentCents)}</Td>
                <Td className="text-[0.875rem] text-ink-600">{customer.lastOrderAt ? dateOnly.format(customer.lastOrderAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <AdminPagination basePath="/dashboard/customers" query={query} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={PAGE_SIZE} />
    </>
  );
}

export default function DashboardCustomersPage(props: PageProps<"/dashboard/customers">) {
  return (
    <>
      <PageHeader title="Customers" description="People who have bought from your store." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Customers {...props} />
      </Suspense>
    </>
  );
}
