import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageEditor } from "@/components/admin/content/page-editor";
import { PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Edit page" };

async function Editor({ params }: PageProps<"/admin/content/pages/[id]">) {
  const [{ id }] = await Promise.all([params, requirePagePermission("content.manage", "/admin/content/pages")]);
  const page = id === "new" ? null : await db.page.findFirst({ where: { id, deletedAt: null } });
  if (id !== "new" && !page) notFound();
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Pages & FAQ", href: "/admin/content/pages" }, { label: page?.title ?? "New page" }]} title={page?.title ?? "New page"} />
      <div className="rounded-lg border border-line bg-surface p-5">
        <PageEditor page={page} />
      </div>
    </>
  );
}

export default function PageEditorPage(props: PageProps<"/admin/content/pages/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Editor {...props} />
    </Suspense>
  );
}
