import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPagination, Card, dateTime, PageHeader, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import type { Prisma } from "@/generated/prisma/client";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Audit log" };
const PAGE_SIZE = 50;

async function Audit({ searchParams }: PageProps<"/admin/settings/audit">) {
  const [, query] = await Promise.all([requirePagePermission("audit.view", "/admin/settings/audit"), searchParams]);
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const where: Prisma.AuditLogWhereInput = q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { entityId: q }, { actor: { email: { contains: q, mode: "insensitive" } } }] } : {};
  const [total, entries] = await Promise.all([db.auditLog.count({ where }), db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { actor: { select: { firstName: true, lastName: true, email: true } } } })]);
  const base = query as Record<string, string | string[] | undefined>;
  return (
    <>
      <PageHeader title="Audit log" description="Every administrative and security-relevant action, with who did it and when." />
      <Card padded={false}>
        <form className="flex gap-2 border-b border-line px-5 py-3" method="get">
          <Input name="q" defaultValue={q} placeholder="Search action, summary, entity id or actor" className="h-9 max-w-md" aria-label="Search audit log" />
          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Summary</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && <TableEmpty colSpan={5}>No entries.</TableEmpty>}
            {entries.map((entry) => (
              <tr key={entry.id}>
                <Td className="whitespace-nowrap text-ink-600">{dateTime.format(entry.createdAt)}</Td>
                <Td>{entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : "System"}</Td>
                <Td className="font-mono text-[0.75rem]">{entry.action}</Td>
                <Td>{entry.summary}</Td>
                <Td className="text-ink-500">{entry.ipAddress ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <AdminPagination basePath="/admin/settings/audit" query={base} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} />
      </Card>
    </>
  );
}

export default function AuditPage(props: PageProps<"/admin/settings/audit">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Audit {...props} />
    </Suspense>
  );
}
