import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsSectionForm } from "@/components/admin/settings/settings-forms";
import { Card, FilterLink, PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { SETTINGS_KEYS, type SettingsKey } from "@/features/settings/schema";
import { loadSettings } from "@/features/settings/service";
import { listPaymentProviders } from "@/server/payments/registry";
import { requirePagePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Store settings" };

const LABELS: Record<SettingsKey, string> = { store: "Store", announcement: "Announcement bar", commerce: "Commerce", seo: "SEO", social: "Social links" };

async function Settings({ searchParams }: PageProps<"/admin/settings">) {
  const [, query] = await Promise.all([requirePagePermission("settings.manage", "/admin/settings"), searchParams]);
  const section = (SETTINGS_KEYS.find((key) => key === query.section) ?? "store") as SettingsKey;
  const settings = await loadSettings();
  const providers = listPaymentProviders();
  return (
    <>
      <PageHeader title="Store settings" description="Changes apply across the storefront immediately." />
      <div className="mb-4 flex flex-wrap gap-2">
        {SETTINGS_KEYS.map((key) => (
          <FilterLink key={key} href={`/admin/settings?section=${key}`} active={section === key}>
            {LABELS[key]}
          </FilterLink>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={LABELS[section]} className="xl:col-span-2">
          <SettingsSectionForm key={section} section={section} values={settings[section] as Record<string, unknown>} />
        </Card>
        <Card title="Payments" description="Configured through environment variables (see DEPLOYMENT.md).">
          <ul className="space-y-2 text-sm">
            {providers.map((provider) => (
              <li key={provider.key} className="flex items-center justify-between rounded-sm bg-canvas px-3 py-2">
                <span>
                  <span className="font-medium">{provider.label}</span> <span className="text-[0.75rem] text-ink-500">· {provider.key}</span>
                </span>
                <span className="text-[0.75rem] text-success">enabled</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] text-ink-500">Webhook endpoints: /api/payments/webhooks/&lt;provider&gt;</p>
        </Card>
      </div>
    </>
  );
}

export default function SettingsPage(props: PageProps<"/admin/settings">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Settings {...props} />
    </Suspense>
  );
}
