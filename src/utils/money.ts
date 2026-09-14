export const DEFAULT_CURRENCY = "USD";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale: string) {
  const key = `${locale}:${currency}`;
  let instance = formatters.get(key);
  if (!instance) {
    instance = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(key, instance);
  }
  return instance;
}

/** Formats integer minor units (cents) as a localised currency string. */
export function formatMoney(cents: number, currency = DEFAULT_CURRENCY, locale = "en-US") {
  return formatter(currency, locale).format(cents / 100);
}

/** Parses a user-entered decimal amount ("12.5", "$1,299.00") into cents. Returns null when invalid. */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const normalised = String(input).replace(/[^0-9.\-]/g, "");
  if (normalised === "" || normalised === "-" || normalised === ".") return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function centsToDecimalString(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Percentage saved between a regular and a sale price, rounded down so it is never overstated. */
export function discountPercent(regularCents: number, saleCents: number) {
  if (regularCents <= 0 || saleCents >= regularCents) return 0;
  return Math.floor(((regularCents - saleCents) / regularCents) * 100);
}
