import { formatAddressLines, type AddressSnapshot } from "@/lib/address";
import { formatMoney } from "@/utils/money";
import {
  button,
  divider,
  escapeHtml,
  keyValueRows,
  paragraph,
  renderLayout,
  sectionHeading,
  smallPrint,
  type EmailBrand,
  type RenderedEmail,
} from "./layout";

export type OrderEmailData = {
  number: string;
  placedAt: Date;
  currency: string;
  customerFirstName: string;
  items: Array<{ name: string; variantTitle: string | null; quantity: number; totalCents: number }>;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  couponCode: string | null;
  shippingAddress: AddressSnapshot;
  shippingMethodName: string;
  paymentLabel: string;
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function greeting(name: string) {
  return name ? `Hi ${name},` : "Hello,";
}

function orderItemsTable(order: OrderEmailData) {
  const rows = order.items
    .map(
      (item) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #efeee9;font:14px/1.45 ${FONT};color:#0b0c0e;">
${escapeHtml(item.name)}${item.variantTitle ? `<br><span style="color:#676b74;font-size:13px;">${escapeHtml(item.variantTitle)}</span>` : ""}
</td>
<td align="center" style="padding:10px 8px;border-bottom:1px solid #efeee9;font:14px/1.45 ${FONT};color:#676b74;white-space:nowrap;">× ${item.quantity}</td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #efeee9;font:14px/1.45 ${FONT};color:#0b0c0e;white-space:nowrap;">${escapeHtml(formatMoney(item.totalCents, order.currency))}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}

function orderTotals(order: OrderEmailData) {
  const money = (cents: number) => formatMoney(cents, order.currency);
  const rows: Array<[string, string, { strong?: boolean }?]> = [["Subtotal", money(order.subtotalCents)]];
  if (order.discountCents > 0) rows.push([`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`, `−${money(order.discountCents)}`]);
  rows.push(["Shipping", order.shippingCents === 0 ? "Free" : money(order.shippingCents)]);
  rows.push(["Tax", money(order.taxCents)]);
  rows.push(["Total", money(order.totalCents), { strong: true }]);
  return keyValueRows(rows);
}

function orderSummaryBlock(order: OrderEmailData) {
  const address = formatAddressLines(order.shippingAddress).map(escapeHtml).join("<br>");
  return `${divider()}${sectionHeading(`Order ${order.number}`)}${orderItemsTable(order)}
<div style="height:12px"></div>${orderTotals(order)}${divider()}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="top" style="width:50%;padding-right:12px;">${sectionHeading("Shipping to")}<p style="margin:0;font:14px/1.6 ${FONT};color:#3a3d44;">${address}</p></td>
<td valign="top" style="width:50%;padding-left:12px;">${sectionHeading("Delivery")}<p style="margin:0 0 14px;font:14px/1.6 ${FONT};color:#3a3d44;">${escapeHtml(order.shippingMethodName)}</p>
${sectionHeading("Payment")}<p style="margin:0;font:14px/1.6 ${FONT};color:#3a3d44;">${escapeHtml(order.paymentLabel)}</p></td>
</tr></table>`;
}

function orderText(order: OrderEmailData) {
  const money = (cents: number) => formatMoney(cents, order.currency);
  return [
    `Order ${order.number}`,
    ...order.items.map((item) => `- ${item.name}${item.variantTitle ? ` (${item.variantTitle})` : ""} × ${item.quantity}: ${money(item.totalCents)}`),
    `Subtotal: ${money(order.subtotalCents)}`,
    order.discountCents ? `Discount: -${money(order.discountCents)}` : "",
    `Shipping: ${order.shippingCents ? money(order.shippingCents) : "Free"}`,
    `Tax: ${money(order.taxCents)}`,
    `Total: ${money(order.totalCents)}`,
    "",
    "Shipping to:",
    ...formatAddressLines(order.shippingAddress),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function welcomeEmail(brand: EmailBrand, input: { firstName: string; verifyUrl: string }): RenderedEmail {
  const heading = `Welcome to ${brand.storeName}`;
  return {
    subject: `Welcome to ${brand.storeName} — please confirm your email`,
    html: renderLayout({
      brand,
      preheader: "Confirm your email to finish setting up your account.",
      heading,
      bodyHtml:
        paragraph(greeting(input.firstName)) +
        paragraph("Your account is ready. Confirm your email address so we can keep your orders, receipts and account security messages flowing to the right inbox.") +
        button("Confirm email address", input.verifyUrl) +
        smallPrint("This link expires in 48 hours. If you didn't create an account, you can safely ignore this email."),
    }),
    text: `${greeting(input.firstName)}\n\nYour ${brand.storeName} account is ready. Confirm your email address:\n${input.verifyUrl}\n\nThis link expires in 48 hours.\n\n— ${brand.storeName}`,
  };
}

export function verifyEmailEmail(brand: EmailBrand, input: { firstName: string; verifyUrl: string }): RenderedEmail {
  return {
    subject: "Confirm your email address",
    html: renderLayout({
      brand,
      preheader: "One click to confirm your email address.",
      heading: "Confirm your email address",
      bodyHtml:
        paragraph(greeting(input.firstName)) +
        paragraph("Use the button below to confirm this is your email address.") +
        button("Confirm email address", input.verifyUrl) +
        smallPrint("This link expires in 48 hours. If you didn't request it, you can ignore this email."),
    }),
    text: `${greeting(input.firstName)}\n\nConfirm your email address:\n${input.verifyUrl}\n\nThis link expires in 48 hours.\n\n— ${brand.storeName}`,
  };
}

export function passwordResetEmail(brand: EmailBrand, input: { firstName: string; resetUrl: string }): RenderedEmail {
  return {
    subject: "Reset your password",
    html: renderLayout({
      brand,
      preheader: "Use this link within the next hour to choose a new password.",
      heading: "Reset your password",
      bodyHtml:
        paragraph(greeting(input.firstName)) +
        paragraph("We received a request to reset the password for your account. Choose a new password using the button below.") +
        button("Choose a new password", input.resetUrl) +
        smallPrint("The link expires in 1 hour and can only be used once. Resetting your password signs you out on all devices. If you didn't ask for this, no action is needed — your password stays the same."),
    }),
    text: `${greeting(input.firstName)}\n\nReset your password (valid for 1 hour):\n${input.resetUrl}\n\nIf you didn't ask for this, ignore this email.\n\n— ${brand.storeName}`,
  };
}

export function orderConfirmationEmail(brand: EmailBrand, input: { order: OrderEmailData; orderUrl: string; paid: boolean }): RenderedEmail {
  const { order } = input;
  const intro = input.paid
    ? "Thank you for your order. Your payment has been received and we're getting everything ready."
    : "Thank you for your order. We've received it and will be in touch as soon as it ships.";
  return {
    subject: `Order ${order.number} confirmed`,
    html: renderLayout({
      brand,
      preheader: `We've received order ${order.number}.`,
      heading: "Thank you — your order is confirmed",
      bodyHtml: paragraph(greeting(order.customerFirstName)) + paragraph(intro) + button("View your order", input.orderUrl) + orderSummaryBlock(order),
    }),
    text: `${greeting(order.customerFirstName)}\n\n${intro}\n\nView your order: ${input.orderUrl}\n\n${orderText(order)}\n\n— ${brand.storeName}`,
  };
}

export function paymentConfirmationEmail(brand: EmailBrand, input: { order: OrderEmailData; orderUrl: string }): RenderedEmail {
  const { order } = input;
  const amount = formatMoney(order.totalCents, order.currency);
  return {
    subject: `Payment received for order ${order.number}`,
    html: renderLayout({
      brand,
      preheader: `We've received ${amount} for order ${order.number}.`,
      heading: "Payment received",
      bodyHtml:
        paragraph(greeting(order.customerFirstName)) +
        paragraph(`We've received your payment of ${amount} for order ${order.number}. This email is your receipt.`) +
        button("View order", input.orderUrl) +
        orderSummaryBlock(order),
    }),
    text: `${greeting(order.customerFirstName)}\n\nWe've received your payment of ${amount} for order ${order.number}.\n${input.orderUrl}\n\n${orderText(order)}\n\n— ${brand.storeName}`,
  };
}

export function paymentFailedEmail(brand: EmailBrand, input: { order: OrderEmailData; retryUrl: string; reason?: string }): RenderedEmail {
  const { order } = input;
  return {
    subject: `Payment for order ${order.number} didn't go through`,
    html: renderLayout({
      brand,
      preheader: "Your order is saved — complete payment to confirm it.",
      heading: "Your payment didn't go through",
      bodyHtml:
        paragraph(greeting(order.customerFirstName)) +
        paragraph(`We couldn't take payment for order ${order.number}${input.reason ? ` (${input.reason})` : ""}. No money has been taken. Your order is saved — you can try again with the same or a different payment method.`) +
        button("Complete payment", input.retryUrl) +
        smallPrint("Items are not reserved until payment is confirmed."),
    }),
    text: `${greeting(order.customerFirstName)}\n\nWe couldn't take payment for order ${order.number}. No money has been taken.\nComplete payment: ${input.retryUrl}\n\n— ${brand.storeName}`,
  };
}

export function shippingConfirmationEmail(
  brand: EmailBrand,
  input: { order: OrderEmailData; orderUrl: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null },
): RenderedEmail {
  const { order } = input;
  const trackingRows: Array<[string, string]> = [];
  if (input.carrier) trackingRows.push(["Carrier", input.carrier]);
  if (input.trackingNumber) trackingRows.push(["Tracking number", input.trackingNumber]);
  return {
    subject: `Your order ${order.number} is on its way`,
    html: renderLayout({
      brand,
      preheader: "Your parcel has left our studio.",
      heading: "Your order is on its way",
      bodyHtml:
        paragraph(greeting(order.customerFirstName)) +
        paragraph(`Good news — order ${order.number} has shipped via ${order.shippingMethodName}.`) +
        (trackingRows.length ? keyValueRows(trackingRows) : "") +
        button(input.trackingUrl ? "Track your parcel" : "View order status", input.trackingUrl ?? input.orderUrl) +
        orderSummaryBlock(order),
    }),
    text: `${greeting(order.customerFirstName)}\n\nOrder ${order.number} has shipped.${input.trackingNumber ? `\nTracking: ${input.carrier ?? ""} ${input.trackingNumber}` : ""}\n${input.trackingUrl ?? input.orderUrl}\n\n— ${brand.storeName}`,
  };
}

export function deliveryConfirmationEmail(brand: EmailBrand, input: { order: OrderEmailData; orderUrl: string; reviewUrl: string }): RenderedEmail {
  const { order } = input;
  return {
    subject: `Order ${order.number} has been delivered`,
    html: renderLayout({
      brand,
      preheader: "Your order has arrived. We'd love to hear what you think.",
      heading: "Your order has been delivered",
      bodyHtml:
        paragraph(greeting(order.customerFirstName)) +
        paragraph(`Order ${order.number} was delivered. We hope everything is just right. If something isn't, you can start a return from your order page.`) +
        button("Review your purchase", input.reviewUrl) +
        smallPrint(`Not the right fit? Returns are free within the return window shown on your order page: ${input.orderUrl}`),
    }),
    text: `${greeting(order.customerFirstName)}\n\nOrder ${order.number} was delivered.\nReview your purchase: ${input.reviewUrl}\nOrder: ${input.orderUrl}\n\n— ${brand.storeName}`,
  };
}

export function refundEmail(brand: EmailBrand, input: { order: OrderEmailData; amountCents: number; orderUrl: string }): RenderedEmail {
  const { order } = input;
  const amount = formatMoney(input.amountCents, order.currency);
  return {
    subject: `Refund of ${amount} for order ${order.number}`,
    html: renderLayout({
      brand,
      preheader: `We've refunded ${amount} to your original payment method.`,
      heading: "Your refund is on its way",
      bodyHtml:
        paragraph(greeting(order.customerFirstName)) +
        paragraph(`We've issued a refund of ${amount} for order ${order.number} to your original payment method. Depending on your bank, it can take 5–10 business days to appear.`) +
        button("View order", input.orderUrl),
    }),
    text: `${greeting(order.customerFirstName)}\n\nWe've refunded ${amount} for order ${order.number}. Allow 5–10 business days.\n${input.orderUrl}\n\n— ${brand.storeName}`,
  };
}

export function cancellationEmail(brand: EmailBrand, input: { order: OrderEmailData; reason?: string; orderUrl: string; refunded: boolean }): RenderedEmail {
  const { order } = input;
  const refundLine = input.refunded
    ? "Any payment taken has been refunded to your original payment method."
    : "No payment was taken for this order.";
  return {
    subject: `Order ${order.number} has been cancelled`,
    html: renderLayout({
      brand,
      preheader: `Order ${order.number} was cancelled.`,
      heading: "Your order has been cancelled",
      bodyHtml:
        paragraph(greeting(order.customerFirstName)) +
        paragraph(`Order ${order.number} has been cancelled${input.reason ? `: ${input.reason}` : "."}`) +
        paragraph(refundLine) +
        button("View order", input.orderUrl),
    }),
    text: `${greeting(order.customerFirstName)}\n\nOrder ${order.number} has been cancelled. ${refundLine}\n${input.orderUrl}\n\n— ${brand.storeName}`,
  };
}

export function staffAlertEmail(brand: EmailBrand, input: { title: string; lines: string[]; href: string; cta: string }): RenderedEmail {
  return {
    subject: `[${brand.storeName}] ${input.title}`,
    html: renderLayout({
      brand,
      preheader: input.lines[0] ?? input.title,
      heading: input.title,
      bodyHtml: input.lines.map(paragraph).join("") + button(input.cta, input.href),
      footerNote: "You're receiving this because you're a member of the store team.",
    }),
    text: `${input.title}\n\n${input.lines.join("\n")}\n\n${input.href}\n\n— ${brand.storeName}`,
  };
}
