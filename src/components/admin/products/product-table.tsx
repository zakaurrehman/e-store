"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { bulkProductAction } from "@/features/admin/products/actions";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export type ProductRow = {
  id: string;
  name: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  imageUrl: string | null;
  brand: string | null;
  category: string | null;
  priceCents: number;
  maxPriceCents: number;
  totalStock: number;
  inStock: boolean;
  variantCount: number;
  salesCount: number;
  updatedAt: string;
};

const STATUS_TONE = { DRAFT: "neutral", ACTIVE: "success", ARCHIVED: "warning" } as const;

export function ProductTable({ rows, permissions }: { rows: ProductRow[]; permissions: { update: boolean; delete: boolean; inventory: boolean } }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"price" | "stock" | null>(null);
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [stock, setStock] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const run = (input: Record<string, unknown>) =>
    startTransition(async () => {
      const result = await bulkProductAction({ ids: [...selected], ...input });
      if (result.status === "error") toast({ title: result.message, tone: "error" });
      else {
        toast({ title: (result.status === "success" && result.message) || "Done" });
        setSelected(new Set());
        setBulk(null);
        router.refresh();
      }
    });

  return (
    <>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-5 py-2.5 text-sm">
          <span className="tabular mr-2 font-medium">{selected.size} selected</span>
          {permissions.update && (
            <>
              <Button size="xs" variant="secondary" loading={pending} onClick={() => run({ action: "publish" })}>
                Publish
              </Button>
              <Button size="xs" variant="secondary" loading={pending} onClick={() => run({ action: "unpublish" })}>
                Set to draft
              </Button>
              <Button size="xs" variant="secondary" loading={pending} onClick={() => run({ action: "feature" })}>
                Feature
              </Button>
              <Button size="xs" variant="secondary" loading={pending} onClick={() => run({ action: "unfeature" })}>
                Unfeature
              </Button>
              <Button size="xs" variant="secondary" onClick={() => setBulk("price")}>
                Update prices
              </Button>
            </>
          )}
          {permissions.inventory && (
            <Button size="xs" variant="secondary" onClick={() => setBulk("stock")}>
              Set stock
            </Button>
          )}
          {permissions.delete && (
            <>
              <Button size="xs" variant="secondary" loading={pending} onClick={() => run({ action: "archive" })}>
                Archive
              </Button>
              <Button size="xs" variant="ghost" className="text-danger hover:bg-danger-soft" loading={pending} onClick={() => window.confirm(`Delete ${selected.size} product(s)? Products with orders will be archived instead.`) && run({ action: "delete" })}>
                Delete
              </Button>
            </>
          )}
          <button type="button" className="ml-auto text-ink-500 underline underline-offset-4" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr>
              <th className="w-10 border-b border-line py-2.5 pl-5">
                <Checkbox checked={allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())} aria-label="Select all" />
              </th>
              {["Product", "Status", "Category", "Price", "Stock", "Sold", "Updated"].map((label) => (
                <th key={label} scope="col" className={cn("border-b border-line px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500", (label === "Price" || label === "Stock" || label === "Sold") && "text-right")}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">
                  No products match these filters.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className={cn("hover:bg-canvas/60", selected.has(row.id) && "bg-iris-50")}>
                <td className="border-b border-line py-3 pl-5">
                  <Checkbox
                    checked={selected.has(row.id)}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                    aria-label={`Select ${row.name}`}
                  />
                </td>
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-sm bg-canvas">{row.imageUrl && <Image src={row.imageUrl} alt="" fill sizes="44px" className="object-cover" />}</div>
                    <div className="min-w-0">
                      <Link href={`/admin/products/${row.id}`} className="block truncate font-medium text-ink-950 hover:underline">
                        {row.name}
                      </Link>
                      <span className="block text-[0.75rem] text-ink-500">
                        {row.brand ?? "No brand"} · {row.variantCount} variant{row.variantCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </Td>
                <Td>
                  <StatusBadge label={row.status.charAt(0) + row.status.slice(1).toLowerCase()} tone={STATUS_TONE[row.status]} />
                </Td>
                <Td className="text-ink-600">{row.category ?? "—"}</Td>
                <Td className="tabular text-right">{row.maxPriceCents > row.priceCents ? `${formatMoney(row.priceCents)} – ${formatMoney(row.maxPriceCents)}` : formatMoney(row.priceCents)}</Td>
                <Td className={cn("tabular text-right", !row.inStock ? "text-danger" : row.totalStock <= 5 ? "text-warning" : "")}>{row.inStock ? row.totalStock : "Sold out"}</Td>
                <Td className="tabular text-right text-ink-600">{row.salesCount}</Td>
                <Td className="whitespace-nowrap text-ink-500">{row.updatedAt}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={bulk !== null}
        onClose={() => setBulk(null)}
        title={bulk === "price" ? `Update prices on ${selected.size} product${selected.size === 1 ? "" : "s"}` : `Set stock on ${selected.size} product${selected.size === 1 ? "" : "s"}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulk(null)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={() => run(bulk === "price" ? { action: "price", percent: percent || undefined, amount: amount || undefined } : { action: "stock", stock })}>
              Apply
            </Button>
          </div>
        }
      >
        {bulk === "price" ? (
          <div className="space-y-4">
            <Field label="Change by percentage" htmlFor="bulk-percent" hint="e.g. -15 for a 15% reduction; applies to regular and sale prices">
              <Input id="bulk-percent" inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value)} placeholder="0" />
            </Field>
            <Field label="Then add a fixed amount" htmlFor="bulk-amount" hint="e.g. -5 or 2.50" optional>
              <Input id="bulk-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            </Field>
          </div>
        ) : (
          <Field label="Stock quantity for every variant" htmlFor="bulk-stock" hint="Recorded in the inventory ledger as a bulk update.">
            <Input id="bulk-stock" type="number" min={0} value={stock} onChange={(event) => setStock(event.target.value)} />
          </Field>
        )}
      </Dialog>
    </>
  );
}
