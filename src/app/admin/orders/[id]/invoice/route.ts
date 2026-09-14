import { getAdminOrder } from "@/features/admin/orders/queries";
import { renderInvoicePdf } from "@/features/admin/orders/invoice";
import { loadSettings } from "@/features/settings/service";
import { formatAddressLines, isAddressSnapshot } from "@/lib/address";
import { escapeHtml } from "@/emails/layout";
import { getCurrentUser } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import { formatMoney } from "@/utils/money";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

/** Printable invoice (HTML with print styles) or PDF download (?format=pdf). Staff with orders.view only. */
export async function GET(request: Request, { params }: RouteContext<"/admin/orders/[id]/invoice">) {
  const user = await getCurrentUser();
  if (!user || !user.role.isStaff || !hasPermission(user.permissions, "orders.view")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const [order, settings] = await Promise.all([getAdminOrder(id), loadSettings()]);
  if (!order) return new Response("Not found", { status: 404 });

  if (new URL(request.url).searchParams.get("format") === "pdf") {
    const bytes = await renderInvoicePdf(order, settings);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="invoice-${order.number}.pdf"`, "Cache-Control": "private, no-store" },
    });
  }

  const shipping = isAddressSnapshot(order.shippingAddress) ? formatAddressLines(order.shippingAddress) : [];
  const billing = isAddressSnapshot(order.billingAddress) ? formatAddressLines(order.billingAddress) : [order.email];
  const money = (cents: number) => escapeHtml(formatMoney(cents, order.currency));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(order.number)}</title>
<style>
body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#0b0c0e;margin:0;padding:48px;max-width:820px}
h1{font-size:20px;margin:0;letter-spacing:.2em}table{width:100%;border-collapse:collapse;margin-top:24px}th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#676b74;border-bottom:1px solid #0b0c0e;padding:8px 0}
td{padding:8px 0;border-bottom:1px solid #e6e5df;vertical-align:top}.r{text-align:right}.muted{color:#676b74}.totals{margin-left:auto;width:280px;margin-top:16px}.totals td{border:0;padding:3px 0}.grand td{font-weight:700;font-size:15px;border-top:1px solid #0b0c0e;padding-top:8px}
.head{display:flex;justify-content:space-between;align-items:flex-start}.addr{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px}.addr h3{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#676b74;margin:0 0 6px}
@media print{body{padding:0}.noprint{display:none}}
.noprint{margin-bottom:24px}.noprint button{font:inherit;padding:8px 14px;border:1px solid #0b0c0e;background:#0b0c0e;color:#fff;border-radius:6px;cursor:pointer}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print</button> <a href="?format=pdf" style="margin-left:12px">Download PDF</a></div>
<div class="head"><div><h1>${escapeHtml(settings.store.name.toUpperCase())}</h1><div class="muted">${escapeHtml(settings.store.legalName)}${settings.store.address ? `<br>${escapeHtml(settings.store.address)}` : ""}</div></div>
<div style="text-align:right"><div style="font-size:20px;font-weight:700">Invoice</div><div>Order ${escapeHtml(order.number)}</div><div class="muted">${dateFormat.format(order.placedAt)}</div><div class="muted">${escapeHtml(order.paymentProvider)} · ${escapeHtml(order.paymentStatus.toLowerCase())}</div></div></div>
<div class="addr"><div><h3>Bill to</h3>${billing.map(escapeHtml).join("<br>")}<br><span class="muted">${escapeHtml(order.email)}</span></div><div><h3>Ship to</h3>${shipping.map(escapeHtml).join("<br>")}<br><span class="muted">${escapeHtml(order.shippingMethodName)}</span></div></div>
<table><thead><tr><th>Item</th><th>SKU</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>
${order.items.map((item) => `<tr><td>${escapeHtml(item.productName)}${item.variantTitle ? `<br><span class="muted">${escapeHtml(item.variantTitle)}</span>` : ""}</td><td class="muted">${escapeHtml(item.sku ?? "—")}</td><td class="r">${item.quantity}</td><td class="r">${money(item.unitPriceCents)}</td><td class="r">${money(item.totalCents)}</td></tr>`).join("")}
</tbody></table>
<table class="totals"><tr><td class="muted">Subtotal</td><td class="r">${money(order.subtotalCents)}</td></tr>
${order.discountCents > 0 ? `<tr><td class="muted">Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}</td><td class="r">−${money(order.discountCents)}</td></tr>` : ""}
<tr><td class="muted">Shipping</td><td class="r">${money(order.shippingCents)}</td></tr><tr><td class="muted">Tax</td><td class="r">${money(order.taxCents)}</td></tr>
<tr class="grand"><td>Total</td><td class="r">${money(order.totalCents)}</td></tr>
${order.refundedCents > 0 ? `<tr><td class="muted">Refunded</td><td class="r">−${money(order.refundedCents)}</td></tr>` : ""}</table>
<p class="muted" style="margin-top:48px">Thank you for shopping with ${escapeHtml(settings.store.name)}.${settings.store.supportEmail ? ` Questions? ${escapeHtml(settings.store.supportEmail)}` : ""}</p>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
