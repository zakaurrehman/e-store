import type { Metadata } from "next";
import { Suspense } from "react";
import { CsvImportForm, WooCommerceImportForm } from "@/components/admin/imports/import-forms";
import { Card, dateTime, PageHeader, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { Alert, Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Import & export" };

async function Imports() {
  await requirePagePermission("products.import", "/admin/imports");
  const runs = await db.importRun.findMany({ orderBy: { startedAt: "desc" }, take: 20, include: { _count: { select: { records: true } } } });
  return (
    <>
      <PageHeader title="Import & export" description="Bring a catalogue in from a CSV or a WooCommerce store. Imports are idempotent — running them again updates rather than duplicates." />
      <Alert tone="info" className="mb-6">
        Only import content you have the right to use. Third-party product names, descriptions and photographs are usually protected; the importer records the source of every asset so it can be audited.
      </Alert>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="CSV import" description="Also the fastest way to bulk-edit: export, change in a spreadsheet, re-import.">
          <CsvImportForm />
        </Card>
        <Card title="WooCommerce import" description="Public Store API, read-only.">
          <WooCommerceImportForm defaultUrl={process.env.IMPORT_SOURCE_URL ?? ""} />
        </Card>
      </div>
      <Card title="Recent runs" padded={false} className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>Started</Th>
              <Th>Source</Th>
              <Th>Entity</Th>
              <Th>Status</Th>
              <Th>Result</Th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && <TableEmpty colSpan={5}>No imports yet.</TableEmpty>}
            {runs.map((run) => {
              const stats = run.stats as { products?: { created: number; updated: number; skipped: number; failed: number }; images?: { downloaded: number; failed: number } };
              return (
                <tr key={run.id}>
                  <Td className="whitespace-nowrap text-ink-600">{dateTime.format(run.startedAt)}</Td>
                  <Td className="font-mono text-[0.75rem]">{run.source}</Td>
                  <Td>
                    {run.entity}
                    {run.dryRun && <span className="ml-1 text-[0.75rem] text-ink-500">(dry run)</span>}
                  </Td>
                  <Td>
                    <StatusBadge label={run.status.toLowerCase()} tone={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "danger" : "warning"} />
                  </Td>
                  <Td className="text-ink-600">
                    {run.error ? <span className="text-danger">{run.error}</span> : stats.products ? `${stats.products.created} created · ${stats.products.updated} updated · ${stats.products.skipped} unchanged · ${stats.products.failed} failed · ${run._count.records} records` : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export default function ImportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Imports />
    </Suspense>
  );
}
