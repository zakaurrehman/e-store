import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaLibrary } from "@/components/admin/media/media-library";
import { PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Media library" };

async function Media() {
  await requirePagePermission("media.manage", "/admin/media");
  return (
    <>
      <PageHeader title="Media library" description="Uploads are validated, stripped of metadata and converted to optimised WebP. JPEG, PNG, WebP, AVIF and GIF up to 10 MB." />
      <MediaLibrary />
    </>
  );
}

export default function MediaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Media />
    </Suspense>
  );
}
