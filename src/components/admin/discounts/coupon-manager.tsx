"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ActionButton, ActionForm } from "@/components/admin/forms";
import { StatusBadge, Td, dateOnly } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { deleteCouponAction, saveCouponAction } from "@/features/admin/discounts";
import { formatMoney } from "@/utils/money";

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
  value: number;
  scope: "ORDER" | "PRODUCTS" | "CATEGORIES";
  productIds: string[];
  categoryIds: string[];
  customerEmails: string[];
  minSubtotalCents: number | null;
  maxDiscountCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  redemptionTotalCents: number;
};

type Options = { products: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }> };

function describe(coupon: CouponRow) {
  const base = coupon.type === "PERCENTAGE" ? `${coupon.value}% off` : coupon.type === "FIXED_AMOUNT" ? `${formatMoney(coupon.value)} off` : "Free shipping";
  const scope = coupon.scope === "ORDER" ? "the order" : coupon.scope === "PRODUCTS" ? `${coupon.productIds.length} product${coupon.productIds.length === 1 ? "" : "s"}` : `${coupon.categoryIds.length} categor${coupon.categoryIds.length === 1 ? "y" : "ies"}`;
  return `${base} · ${scope}`;
}

function statusOf(coupon: CouponRow): { label: string; tone: "success" | "neutral" | "warning" | "danger" } {
  const now = Date.now();
  if (!coupon.isActive) return { label: "Inactive", tone: "neutral" };
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return { label: "Scheduled", tone: "warning" };
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now) return { label: "Expired", tone: "danger" };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return { label: "Limit reached", tone: "danger" };
  return { label: "Active", tone: "success" };
}

const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

function CouponForm({ coupon, options, onDone }: { coupon: CouponRow | null; options: Options; onDone: () => void }) {
  const [type, setType] = useState(coupon?.type ?? "PERCENTAGE");
  const [scope, setScope] = useState(coupon?.scope ?? "ORDER");
  const [productIds, setProductIds] = useState<string[]>(coupon?.productIds ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(coupon?.categoryIds ?? []);
  return (
    <ActionForm action={saveCouponAction} submitLabel={coupon ? "Save coupon" : "Create coupon"} onSuccess={onDone}>
      {coupon && <input type="hidden" name="id" value={coupon.id} />}
      <input type="hidden" name="productIds" value={productIds.join(",")} />
      <input type="hidden" name="categoryIds" value={categoryIds.join(",")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" htmlFor="code" hint="Customers enter this at checkout. Letters and numbers, no spaces.">
          <Input id="code" name="code" defaultValue={coupon?.code ?? ""} required className="uppercase" autoFocus />
        </Field>
        <Field label="Description" htmlFor="description" optional hint="Shown to customers when applied.">
          <Input id="description" name="description" defaultValue={coupon?.description ?? ""} maxLength={200} />
        </Field>
        <Field label="Discount type" htmlFor="type">
          <Select id="type" name="type" value={type} onChange={(event) => setType(event.target.value as CouponRow["type"])}>
            <option value="PERCENTAGE">Percentage off</option>
            <option value="FIXED_AMOUNT">Fixed amount off</option>
            <option value="FREE_SHIPPING">Free shipping</option>
          </Select>
        </Field>
        {type !== "FREE_SHIPPING" && (
          <Field label={type === "PERCENTAGE" ? "Percentage" : "Amount"} htmlFor="value">
            <Input id="value" name="value" inputMode="decimal" defaultValue={coupon ? (coupon.type === "PERCENTAGE" ? String(coupon.value) : (coupon.value / 100).toFixed(2)) : ""} placeholder={type === "PERCENTAGE" ? "10" : "15.00"} required />
          </Field>
        )}
        {type === "FREE_SHIPPING" && <input type="hidden" name="value" value="0" />}
        <Field label="Applies to" htmlFor="scope">
          <Select id="scope" name="scope" value={scope} onChange={(event) => setScope(event.target.value as CouponRow["scope"])}>
            <option value="ORDER">Whole order</option>
            <option value="PRODUCTS">Specific products</option>
            <option value="CATEGORIES">Specific categories</option>
          </Select>
        </Field>
        <Field label="Minimum order subtotal" htmlFor="minSubtotal" optional>
          <Input id="minSubtotal" name="minSubtotal" inputMode="decimal" defaultValue={coupon?.minSubtotalCents ? (coupon.minSubtotalCents / 100).toFixed(2) : ""} placeholder="0.00" />
        </Field>
        {scope === "PRODUCTS" && (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">Products</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border border-line p-2">
              {options.products.map((product) => (
                <Checkbox key={product.id} id={`cp-${product.id}`} checked={productIds.includes(product.id)} onChange={(event) => setProductIds(event.target.checked ? [...productIds, product.id] : productIds.filter((id) => id !== product.id))} label={<span className="text-[0.8125rem]">{product.name}</span>} />
              ))}
            </div>
          </div>
        )}
        {scope === "CATEGORIES" && (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">Categories</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border border-line p-2">
              {options.categories.map((category) => (
                <Checkbox key={category.id} id={`cc-${category.id}`} checked={categoryIds.includes(category.id)} onChange={(event) => setCategoryIds(event.target.checked ? [...categoryIds, category.id] : categoryIds.filter((id) => id !== category.id))} label={<span className="text-[0.8125rem]">{category.name}</span>} />
              ))}
            </div>
          </div>
        )}
        {type === "PERCENTAGE" && (
          <Field label="Maximum discount" htmlFor="maxDiscount" optional hint="Caps the discount amount.">
            <Input id="maxDiscount" name="maxDiscount" inputMode="decimal" defaultValue={coupon?.maxDiscountCents ? (coupon.maxDiscountCents / 100).toFixed(2) : ""} placeholder="0.00" />
          </Field>
        )}
        <Field label="Starts" htmlFor="startsAt" optional>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocalInput(coupon?.startsAt ?? null)} />
        </Field>
        <Field label="Ends" htmlFor="endsAt" optional>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocalInput(coupon?.endsAt ?? null)} />
        </Field>
        <Field label="Total usage limit" htmlFor="usageLimit" optional>
          <Input id="usageLimit" name="usageLimit" type="number" min={0} defaultValue={coupon?.usageLimit ?? ""} />
        </Field>
        <Field label="Uses per customer" htmlFor="usageLimitPerCustomer" optional>
          <Input id="usageLimitPerCustomer" name="usageLimitPerCustomer" type="number" min={0} defaultValue={coupon?.usageLimitPerCustomer ?? ""} />
        </Field>
        <Field label="Restrict to customers" htmlFor="customerEmails" optional hint="Comma-separated account emails. Leave empty for everyone." className="sm:col-span-2">
          <Textarea id="customerEmails" name="customerEmails" rows={2} defaultValue={coupon?.customerEmails.join(", ") ?? ""} />
        </Field>
        <div className="flex flex-wrap gap-6 sm:col-span-2">
          <Checkbox id="firstOrderOnly" name="firstOrderOnly" defaultChecked={coupon?.firstOrderOnly ?? false} label="First order only" />
          <Checkbox id="isActive" name="isActive" defaultChecked={coupon?.isActive ?? true} label="Active" />
        </div>
      </div>
    </ActionForm>
  );
}

export function CouponManager({ coupons, options }: { coupons: CouponRow[]; options: Options }) {
  const [editing, setEditing] = useState<CouponRow | null | "new">(null);
  return (
    <>
      <div className="flex justify-end border-b border-line px-5 py-3">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New coupon
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr>
              {["Code", "Discount", "Status", "Used", "Revenue", "Valid", ""].map((label) => (
                <th key={label} className="border-b border-line px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500 first:pl-5">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">
                  No coupons yet. Create one to offer discounts at checkout.
                </td>
              </tr>
            )}
            {coupons.map((coupon) => {
              const status = statusOf(coupon);
              return (
                <tr key={coupon.id} className="hover:bg-canvas/60">
                  <Td>
                    <span className="font-mono font-semibold tracking-[0.04em]">{coupon.code}</span>
                    {coupon.description && <span className="block text-[0.75rem] text-ink-500">{coupon.description}</span>}
                  </Td>
                  <Td>
                    {describe(coupon)}
                    {coupon.firstOrderOnly && <span className="block text-[0.75rem] text-ink-500">First order only</span>}
                    {coupon.customerEmails.length > 0 && <span className="block text-[0.75rem] text-ink-500">{coupon.customerEmails.length} customer(s)</span>}
                  </Td>
                  <Td>
                    <StatusBadge label={status.label} tone={status.tone} />
                  </Td>
                  <Td className="tabular">
                    {coupon.usedCount}
                    {coupon.usageLimit !== null && ` / ${coupon.usageLimit}`}
                  </Td>
                  <Td className="tabular">{formatMoney(coupon.redemptionTotalCents)}</Td>
                  <Td className="text-ink-600">
                    {coupon.startsAt || coupon.endsAt ? `${coupon.startsAt ? dateOnly.format(new Date(coupon.startsAt)) : "now"} → ${coupon.endsAt ? dateOnly.format(new Date(coupon.endsAt)) : "no end"}` : "Always"}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="ghost" onClick={() => setEditing(coupon)} aria-label={`Edit ${coupon.code}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <ActionButton size="xs" variant="ghost" action={() => deleteCouponAction(coupon.id)} confirm={{ title: `Delete ${coupon.code}?`, description: "Existing orders keep their discount; the code stops working immediately.", destructive: true, confirmLabel: "Delete" }}>
                        <Trash2 className="size-3.5 text-danger" />
                      </ActionButton>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New coupon" : `Edit ${editing?.code ?? ""}`} className="w-[min(calc(100vw-2rem),44rem)]">
        {editing && <CouponForm coupon={editing === "new" ? null : editing} options={options} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}
