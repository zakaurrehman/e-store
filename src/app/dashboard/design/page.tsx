import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader } from "@/components/admin/ui";
import { CopyLink, StoreImageUpload, StoreSettingsForm } from "@/components/dashboard/controls";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { requireStoreOwner } from "@/features/stores/guards";
import { storeUrl } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Design & details" };

async function Design() {
  const { store } = await requireStoreOwner("/dashboard/design");
  const url = storeUrl(store.slug);
  return (
    <div className="space-y-6">
      <Card title="Store address">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink-950">{url.replace(/^https?:\/\//, "")}</p>
            <p className="text-[0.8125rem] text-ink-500">Your store&rsquo;s permanent address. Connecting your own domain is coming soon.</p>
          </div>
          <div className="flex gap-2">
            <CopyLink url={url} />
            <ButtonLink href={url} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
              Open
            </ButtonLink>
          </div>
        </div>
      </Card>
      <Card title="Logo and homepage image">
        <div className="grid gap-6 md:grid-cols-2">
          <StoreImageUpload kind="logo" label="Logo" hint="Shown in your store header. PNG with a transparent background works best." current={store.logo?.url ?? null} />
          <StoreImageUpload kind="hero" label="Homepage image" hint="The large image at the top of your homepage. At least 1600 px wide." current={store.heroImage?.url ?? null} />
        </div>
      </Card>
      <Card title="Details and look">
        <StoreSettingsForm
          values={{
            name: store.name,
            tagline: store.tagline,
            aboutText: store.aboutText,
            supportEmail: store.supportEmail,
            announcement: store.announcement,
            heroTitle: store.heroTitle,
            heroSubtitle: store.heroSubtitle,
            accentColor: store.accentColor,
          }}
        />
      </Card>
    </div>
  );
}

export default function DashboardDesignPage() {
  return (
    <>
      <PageHeader title="Design & details" description="How your store looks and introduces itself. Changes show in your store as soon as you save." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Design />
      </Suspense>
    </>
  );
}
