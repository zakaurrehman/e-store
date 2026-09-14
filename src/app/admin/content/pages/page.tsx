import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FaqManager, PageStatus } from "@/components/admin/content/content-managers";
import { Card, dateTime, FilterLink, PageHeader, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Pages & FAQ" };

async function Pages({ searchParams }: PageProps<"/admin/content/pages">) {
  const [, query] = await Promise.all([requirePagePermission("content.manage", "/admin/content/pages"), searchParams]);
  const tab = query.tab === "faq" ? "faq" : "pages";
  return (
    <>
      <PageHeader
        title="Pages & FAQ"
        description="Static pages (policies, about, help) and the FAQ."
        actions={
          tab === "pages" ? (
            <ButtonLink href="/admin/content/pages/new" size="sm">
              <Plus className="size-4" /> New page
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href="/admin/content/pages" active={tab === "pages"}>
          Pages
        </FilterLink>
        <FilterLink href="/admin/content/pages?tab=faq" active={tab === "faq"}>
          FAQ
        </FilterLink>
      </div>
      {tab === "pages" ? (
        <Card padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Page</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {(await db.page.findMany({ where: { deletedAt: null }, orderBy: { title: "asc" } })).map((page) => (
                <tr key={page.id} className="hover:bg-canvas/60">
                  <Td>
                    <Link href={`/admin/content/pages/${page.id}`} className="font-medium text-ink-950 hover:underline">
                      {page.title}
                    </Link>
                    <span className="block text-[0.75rem] text-ink-500">
                      <Link href={`/pages/${page.slug}`} target="_blank" className="hover:underline">
                        /pages/{page.slug}
                      </Link>
                    </span>
                  </Td>
                  <Td>
                    <PageStatus status={page.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">{dateTime.format(page.updatedAt)}</Td>
                </tr>
              ))}
              {(await db.page.count({ where: { deletedAt: null } })) === 0 && <TableEmpty colSpan={3}>No pages yet.</TableEmpty>}
            </tbody>
          </Table>
        </Card>
      ) : (
        <Card>
          <FaqManager items={await db.faqItem.findMany({ orderBy: [{ group: "asc" }, { position: "asc" }] })} groups={[...new Set((await db.faqItem.findMany({ select: { group: true } })).map((item) => item.group))]} />
        </Card>
      )}
    </>
  );
}

export default function PagesAdmin(props: PageProps<"/admin/content/pages">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Pages {...props} />
    </Suspense>
  );
}
