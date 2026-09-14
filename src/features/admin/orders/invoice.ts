import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatAddressLines, isAddressSnapshot } from "@/lib/address";
import type { StoreSettings } from "@/features/settings/schema";
import type { AdminOrder } from "./queries";
import { formatMoney } from "@/utils/money";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

/** Renders a clean A4 invoice. pdf-lib's standard fonts cover Latin text; amounts use ASCII currency formatting. */
export async function renderInvoicePdf(order: AdminOrder, settings: StoreSettings) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.043, 0.047, 0.055);
  const muted = rgb(0.4, 0.42, 0.45);
  const line = rgb(0.9, 0.9, 0.87);
  const money = (cents: number) => formatMoney(cents, order.currency).replace(/[^\x20-\x7E]/g, "");
  const safe = (text: string) => text.replace(/[^\x20-\x7E]/g, "");

  let y = 800;
  const text = (value: string, x: number, size = 10, font = regular, color = ink) => page.drawText(safe(value), { x, y, size, font, color });

  text(settings.store.name.toUpperCase(), 48, 16, bold);
  page.drawText("INVOICE", { x: 470, y, size: 16, font: bold, color: ink });
  y -= 18;
  text(settings.store.legalName, 48, 9, regular, muted);
  if (settings.store.address) {
    y -= 12;
    text(settings.store.address, 48, 9, regular, muted);
  }
  y -= 30;
  text(`Order ${order.number}`, 48, 11, bold);
  text(`Date: ${dateFormat.format(order.placedAt)}`, 350, 10);
  y -= 14;
  text(`Payment: ${order.paymentProvider} (${order.paymentStatus.toLowerCase()})`, 350, 10, regular, muted);

  y -= 28;
  const shipping = isAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null;
  const billing = isAddressSnapshot(order.billingAddress) ? order.billingAddress : null;
  text("BILL TO", 48, 8, bold, muted);
  text("SHIP TO", 320, 8, bold, muted);
  y -= 14;
  const billLines = billing ? formatAddressLines(billing) : [order.email];
  const shipLines = shipping ? formatAddressLines(shipping) : [];
  const rows = Math.max(billLines.length, shipLines.length, 1);
  for (let index = 0; index < rows; index++) {
    if (billLines[index]) text(billLines[index], 48, 10);
    if (shipLines[index]) text(shipLines[index], 320, 10);
    y -= 13;
  }
  text(order.email, 48, 9, regular, muted);

  y -= 30;
  page.drawLine({ start: { x: 48, y: y + 14 }, end: { x: 547, y: y + 14 }, thickness: 0.8, color: ink });
  text("ITEM", 48, 8, bold, muted);
  text("SKU", 330, 8, bold, muted);
  text("QTY", 420, 8, bold, muted);
  text("PRICE", 460, 8, bold, muted);
  text("TOTAL", 510, 8, bold, muted);
  y -= 18;
  for (const item of order.items) {
    const name = item.variantTitle ? `${item.productName} - ${item.variantTitle}` : item.productName;
    text(name.length > 52 ? `${name.slice(0, 50)}...` : name, 48, 10);
    text(item.sku ?? "-", 330, 9, regular, muted);
    text(String(item.quantity), 420, 10);
    text(money(item.unitPriceCents), 460, 10);
    text(money(item.totalCents), 510, 10);
    y -= 16;
    page.drawLine({ start: { x: 48, y: y + 6 }, end: { x: 547, y: y + 6 }, thickness: 0.5, color: line });
    if (y < 140) {
      y = 800;
      pdf.addPage([595.28, 841.89]);
    }
  }

  y -= 12;
  const totals: Array<[string, string, boolean?]> = [
    ["Subtotal", money(order.subtotalCents)],
    ...(order.discountCents > 0 ? ([[`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`, `-${money(order.discountCents)}`]] as Array<[string, string]>) : []),
    [`Shipping (${order.shippingMethodName})`, money(order.shippingCents)],
    ["Tax", money(order.taxCents)],
    ["Total", money(order.totalCents), true],
    ...(order.refundedCents > 0 ? ([["Refunded", `-${money(order.refundedCents)}`]] as Array<[string, string]>) : []),
  ];
  for (const [label, value, strong] of totals) {
    text(label, 380, strong ? 11 : 10, strong ? bold : regular, strong ? ink : muted);
    text(value, 510, strong ? 11 : 10, strong ? bold : regular);
    y -= 15;
  }

  y = 70;
  text(`Thank you for shopping with ${settings.store.name}.`, 48, 9, regular, muted);
  if (settings.store.supportEmail) {
    y -= 12;
    text(`Questions? ${settings.store.supportEmail}`, 48, 9, regular, muted);
  }
  return pdf.save();
}
