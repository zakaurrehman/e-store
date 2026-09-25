import { Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton, ActionForm } from "@/components/admin/forms";
import { AdminPagination, buildQuery, Card, dateOnly, dateTime, FilterLink, PageHeader, StatTile, StatusBadge, Table, TableEmpty, Td, Th } from "@/components/admin/ui";
import { CopyText } from "@/components/admin/copy-text";
import { Field, Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { createReferralCodesAction, setReferralCodeActiveAction } from "@/features/referrals/actions";
import { listReferralCodes, parseReferralState, REFERRAL_PAGE_SIZE } from "@/features/referrals/queries";
import { REFERRAL_STATE_LABELS, REFERRAL_STATE_TONES, referralUsesLabel } from "@/features/referrals/codes";
import { getStoreSettings } from "@/features/settings/queries";
import { can, requirePagePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Invitations" };

async function Referrals({ searchParams }: PageProps<"/admin/referrals">) {
  const [user, query] = await Promise.all([requirePagePermission("stores.view", "/admin/referrals"), searchParams]);
  const canManage = can(user, "stores.manage");
  const state = parseReferralState(query.state);
  const q = typeof query.q === "string" ? query.q : "";
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const [{ codes, tally, total, pageCount }, settings] = await Promise.all([listReferralCodes({ page, q, state }), getStoreSettings()]);
  const base = query as Record<string, string | string[] | undefined>;

  return (
    <>
      <PageHeader
        title="Invitations"
        description={
          settings.platform.requireReferralCode
            ? "Stores are invitation-only: nobody can open one without a code from this page."
            : "Invitation codes are optional right now — anyone can open a store. Turn invitations on in Settings → Commission & invitations."
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Available" value={tally.ACTIVE} hint="Ready to hand out" tone={tally.ACTIVE === 0 ? "warning" : "default"} />
        <StatTile label="Used" value={tally.USED} hint="Opened a store" />
        <StatTile label="Expired" value={tally.EXPIRED} />
        <StatTile label="Disabled" value={tally.DISABLED} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {canManage && (
          <Card title="Generate codes" description="Random, unguessable, and single-use unless you say otherwise." className="xl:col-span-1">
            <ActionForm action={createReferralCodesAction} submitLabel="Generate">
              <div className="grid gap-4">
                <Field label="How many" htmlFor="ref-count">
                  <Input id="ref-count" name="count" type="number" min={1} max={50} defaultValue={1} />
                </Field>
                <Field label="Uses per code" htmlFor="ref-uses" hint="A campaign code can be used more than once.">
                  <Select id="ref-uses" name="maxUses" defaultValue="1">
                    <option value="1">Single use</option>
                    <option value="5">5 stores</option>
                    <option value="25">25 stores</option>
                    <option value="unlimited">Unlimited</option>
                  </Select>
                </Field>
                <Field label="Expires in" htmlFor="ref-expiry" optional>
                  <Select id="ref-expiry" name="expiresInDays" defaultValue="">
                    <option value="">Never</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </Select>
                </Field>
                <Field label="Label" htmlFor="ref-label" optional hint="Who or what it is for — shown only to staff.">
                  <Input id="ref-label" name="label" maxLength={80} placeholder="e.g. Dubai expo, Maya" />
                </Field>
              </div>
            </ActionForm>
          </Card>
        )}

        <Card padded={false} className={canManage ? "xl:col-span-2" : "xl:col-span-3"} title="Codes" description="Newest first.">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <FilterLink href={`/admin/referrals${buildQuery(base, { state: null, page: null })}`} active={!state}>
              All
            </FilterLink>
            {(["ACTIVE", "USED", "EXPIRED", "DISABLED"] as const).map((value) => (
              <FilterLink key={value} href={`/admin/referrals${buildQuery(base, { state: value, page: null })}`} active={state === value}>
                {REFERRAL_STATE_LABELS[value]}
              </FilterLink>
            ))}
            <form className="ml-auto" action="/admin/referrals">
              <Input name="q" defaultValue={q} placeholder="Code, label or owner email" className="h-9 w-56 text-[0.875rem]" aria-label="Search invitations" />
            </form>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Used by</Th>
                <Th>Uses</Th>
                <Th>Created</Th>
                <Th>Status</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 && (
                <TableEmpty colSpan={canManage ? 6 : 5}>
                  <span className="flex flex-col items-center gap-2 py-6">
                    <Ticket className="size-5 text-ink-400" aria-hidden />
                    No invitation codes {q || state ? "match" : "yet"}.
                  </span>
                </TableEmpty>
              )}
              {codes.map((code) => (
                <tr key={code.id}>
                  <Td>
                    <CopyText value={code.code} className="font-mono text-[0.875rem] font-medium text-ink-950" />
                    {code.label && <p className="text-[0.75rem] text-ink-500">{code.label}</p>}
                  </Td>
                  <Td className="max-w-[16rem] text-[0.8125rem]">
                    {code.redemptions.length === 0 ? (
                      <span className="text-ink-400">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {code.redemptions.map((redemption) => (
                          <li key={redemption.id} className="truncate">
                            {redemption.store?.deletedAt ? (
                              <span className="font-medium text-ink-500">{redemption.store.name} (deleted)</span>
                            ) : redemption.store ? (
                              <Link href={`/admin/stores?q=${redemption.store.slug}`} className="font-medium text-ink-950 hover:underline">
                                {redemption.store.name}
                              </Link>
                            ) : (
                              <span className="font-medium text-ink-950">no store</span>
                            )}
                            <span className="block text-[0.75rem] text-ink-500">
                              {redemption.user.email} · {dateOnly.format(redemption.createdAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td className="tabular text-[0.875rem] text-ink-600">{referralUsesLabel(code)}</Td>
                  <Td className="whitespace-nowrap text-[0.8125rem] text-ink-600">
                    {dateTime.format(code.createdAt)}
                    {code.expiresAt && <span className="block text-[0.75rem] text-ink-500">expires {dateOnly.format(code.expiresAt)}</span>}
                  </Td>
                  <Td>
                    <StatusBadge label={REFERRAL_STATE_LABELS[code.state]} tone={REFERRAL_STATE_TONES[code.state]} />
                  </Td>
                  {canManage && (
                    <Td className="whitespace-nowrap text-right">
                      {code.state === "USED" ? null : code.isActive ? (
                        <ActionButton
                          action={setReferralCodeActiveAction.bind(null, code.id, false)}
                          size="xs"
                          variant="ghost"
                          confirm={{ title: `Disable ${code.code}?`, description: "It can no longer be used to open a store. You can turn it back on later.", confirmLabel: "Disable", destructive: true }}
                        >
                          Disable
                        </ActionButton>
                      ) : (
                        <ActionButton action={setReferralCodeActiveAction.bind(null, code.id, true)} size="xs">
                          Enable
                        </ActionButton>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          <AdminPagination basePath="/admin/referrals" query={base} page={page} pageCount={pageCount} total={total} pageSize={REFERRAL_PAGE_SIZE} />
        </Card>
      </div>
    </>
  );
}

export default function ReferralsPage(props: PageProps<"/admin/referrals">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Referrals {...props} />
    </Suspense>
  );
}
