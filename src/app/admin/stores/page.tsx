import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/forms";
import { AdminPagination, Card, FilterLink, PageHeader, StatusBadge, Table, TableEmpty, Td, Th, buildQuery, dateOnly } from "@/components/admin/ui";
import { StoreMark } from "@/components/store/header/store-brand";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { listStoresForAdmin, STORES_PAGE_SIZE } from "@/features/admin/stores";
import { setStoreStatusAction } from "@/features/stores/actions";
import { storeUrl } from "@/lib/tenancy";
import { can, requirePagePermission } from "@/server/auth/guards";
import { formatMoney } from "@/utils/money";

export const metadata: Metadata = { title: "Stores" };

async function StoresTable({ searchParams }: PageProps<"/admin/stores">) {
  const [user, query] = await Promise.all([requirePagePermission("stores.view", "/admin/stores"), searchParams]);
  const str = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const data = await listStoresForAdmin({ q: str("q"), status: str("status"), page: Number(str("page") ?? 1) || 1 });
  const canManage = can(user, "stores.manage");
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        {[
          ["", "All"],
          ["ACTIVE", "Open"],
          ["SUSPENDED", "Suspended"],
        ].map(([value, label]) => (
          <FilterLink key={label} href={`/admin/stores${buildQuery(query, { status: value || null, page: null })}`} active={(str("status") ?? "") === value}>
            {label}
          </FilterLink>
        ))}
        <form className="ml-auto flex gap-2" role="search">
          {str("status") && <input type="hidden" name="status" value={str("status")} />}
          <label htmlFor="store-search" className="sr-only">
            Search stores
          </label>
          <Input id="store-search" name="q" defaultValue={str("q")} placeholder="Store, address or owner email" className="h-9 w-64" />
        </form>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Store</Th>
            <Th>Owner</Th>
            <Th className="text-right">Products</Th>
            <Th className="text-right">Orders</Th>
            <Th className="text-right">Sales</Th>
            <Th className="text-right">Balance</Th>
            <Th>Opened</Th>
            <Th>Status</Th>
            {canManage && <Th />}
          </tr>
        </thead>
        <tbody>
          {data.stores.length === 0 && <TableEmpty colSpan={canManage ? 9 : 8}>No stores match.</TableEmpty>}
          {data.stores.map((store) => (
            <tr key={store.id}>
              <Td>
                <span className="flex items-center gap-2.5">
                  <StoreMark store={store} size={32} />
                  <span className="min-w-0">
                    <Link href={`/admin/stores/${store.id}`} className="font-medium text-ink-950 hover:underline">
                      {store.name}
                    </Link>
                    <a href={storeUrl(store.slug)} target="_blank" rel="noopener noreferrer" className="block text-[0.75rem] text-ink-500 hover:text-ink-950 hover:underline">
                      {storeUrl(store.slug).replace(/^https?:\/\//, "")}
                    </a>
                    {store.invitation && <span className="block font-mono text-[0.6875rem] text-ink-400">{store.invitation}</span>}
                  </span>
                </span>
              </Td>
              <Td>
                {store.owner ? (
                  <Link href={`/admin/customers/${store.owner.id}`} className="hover:underline">
                    {store.owner.firstName} {store.owner.lastName}
                    <span className="block text-[0.75rem] text-ink-500">{store.owner.email}</span>
                  </Link>
                ) : (
                  <span className="text-ink-500">Platform (demo)</span>
                )}
              </Td>
              <Td className="tabular text-right">{store.products}</Td>
              <Td className="tabular text-right">
                <Link href={`/admin/orders?store=${store.slug}`} className="hover:underline">
                  {store.orders}
                </Link>
              </Td>
              <Td className="tabular text-right">{formatMoney(store.salesCents)}</Td>
              <Td className="tabular text-right">
                {store.owner ? (
                  <Link href={`/admin/stores/${store.id}#ledger`} className="hover:underline">
                    {formatMoney(store.balanceCents)}
                    {store.toAccept > 0 && <span className="block text-[0.75rem] font-medium text-warning">{store.toAccept} waiting for the owner to accept</span>}
                  </Link>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </Td>
              <Td className="whitespace-nowrap text-ink-600">{dateOnly.format(store.createdAt)}</Td>
              <Td>
                <StatusBadge label={store.status === "ACTIVE" ? "Open" : store.status === "SUSPENDED" ? "Suspended" : "Pending"} tone={store.status === "ACTIVE" ? "success" : store.status === "SUSPENDED" ? "danger" : "warning"} />
              </Td>
              {canManage && (
                <Td className="text-right">
                  {store.owner &&
                    (store.status === "SUSPENDED" ? (
                      <ActionButton action={setStoreStatusAction.bind(null, store.id, "ACTIVE")} size="xs">
                        Reopen
                      </ActionButton>
                    ) : (
                      <ActionButton
                        action={setStoreStatusAction.bind(null, store.id, "SUSPENDED")}
                        size="xs"
                        variant="ghost"
                        confirm={{ title: `Suspend ${store.name}?`, description: "The store disappears for shoppers immediately. The owner can still sign in but cannot change it until you reopen it.", confirmLabel: "Suspend store", destructive: true }}
                      >
                        Suspend
                      </ActionButton>
                    ))}
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
      <AdminPagination basePath="/admin/stores" query={query} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={STORES_PAGE_SIZE} />
    </Card>
  );
}

export default function AdminStoresPage(props: PageProps<"/admin/stores">) {
  return (
    <>
      <PageHeader title="Stores" description="Every store opened on Zendropship, with its owner and sales." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <StoresTable {...props} />
      </Suspense>
    </>
  );
}
