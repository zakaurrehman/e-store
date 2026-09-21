/**
 * Table-based, inline-styled email layout that renders consistently in Gmail, Outlook and Apple Mail.
 * All dynamic values must pass through escapeHtml before being interpolated.
 */

export type EmailBrand = {
  storeName: string;
  legalName: string;
  supportEmail: string;
  address: string;
  appUrl: string;
  /** The store's logo as an absolute URL; the name is set as a wordmark when there is none. */
  logoUrl?: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const COLORS = {
  ink: "#0b0c0e",
  body: "#3a3d44",
  muted: "#676b74",
  line: "#e6e5df",
  canvas: "#f5f4f0",
  iris: "#5446ff",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function absoluteUrl(brand: EmailBrand, path: string) {
  return new URL(path, brand.appUrl).toString();
}

export function paragraph(text: string) {
  return `<p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:${COLORS.body};">${escapeHtml(text)}</p>`;
}

export function smallPrint(text: string) {
  return `<p style="margin:16px 0 0;font:13px/1.6 ${FONT};color:${COLORS.muted};">${escapeHtml(text)}</p>`;
}

export function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr><td style="background:${COLORS.ink};border-radius:8px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;letter-spacing:0.01em;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

export function keyValueRows(rows: Array<[string, string, { strong?: boolean }?]>) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows
    .map(
      ([label, value, options]) => `<tr>
<td style="padding:6px 0;font:${options?.strong ? "600 " : ""}14px/1.5 ${FONT};color:${options?.strong ? COLORS.ink : COLORS.muted};">${escapeHtml(label)}</td>
<td align="right" style="padding:6px 0;font:${options?.strong ? "600 " : ""}14px/1.5 ${FONT};color:${COLORS.ink};">${escapeHtml(value)}</td>
</tr>`,
    )
    .join("")}</table>`;
}

/** The customer's own words, set apart from the reply above them. */
export function quote(text: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 0;"><tr><td style="padding:14px 16px;background:${COLORS.canvas};border-radius:8px;font:14px/1.6 ${FONT};color:${COLORS.muted};white-space:pre-line;">${escapeHtml(text)}</td></tr></table>`;
}

export function divider() {
  return `<div style="height:1px;background:${COLORS.line};margin:24px 0;"></div>`;
}

export function sectionHeading(text: string) {
  return `<p style="margin:0 0 10px;font:600 12px/1.4 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.muted};">${escapeHtml(text)}</p>`;
}

export function renderLayout(options: {
  brand: EmailBrand;
  preheader: string;
  heading: string;
  bodyHtml: string;
  footerNote?: string;
}) {
  const { brand } = options;
  const support = brand.supportEmail
    ? `Questions? Reply to this email or write to <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${COLORS.ink};">${escapeHtml(brand.supportEmail)}</a>.`
    : `Questions? Visit <a href="${escapeHtml(absoluteUrl(brand, "/contact"))}" style="color:${COLORS.ink};">our help centre</a>.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.canvas};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 24px;">
<a href="${escapeHtml(brand.appUrl)}" style="text-decoration:none;font:600 15px/1 ${FONT};letter-spacing:0.32em;color:${COLORS.ink};">
${brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.storeName)}" height="32" style="display:block;height:32px;width:auto;max-width:200px;border:0;">` : escapeHtml(brand.storeName.toUpperCase())}</a>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${COLORS.line};border-radius:14px;padding:36px 32px;">
<h1 style="margin:0 0 20px;font:600 24px/1.25 ${FONT};letter-spacing:-0.01em;color:${COLORS.ink};">${escapeHtml(options.heading)}</h1>
${options.bodyHtml}
</td></tr>
<tr><td style="padding:24px 8px 0;font:13px/1.6 ${FONT};color:${COLORS.muted};">
${support}<br>
${options.footerNote ? `${escapeHtml(options.footerNote)}<br>` : ""}
© ${new Date().getFullYear()} ${escapeHtml(brand.legalName)}${brand.address ? ` · ${escapeHtml(brand.address)}` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
