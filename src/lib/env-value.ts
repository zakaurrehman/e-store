/**
 * Normalises a raw environment value the way hosting dashboards and pasted .env files deliver it:
 * surrounding whitespace (including a trailing \r from Windows line endings) and one pair of matching quotes
 * are removed. Empty or whitespace-only values count as unset.
 */
export function cleanEnvValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let cleaned = value.trim();
  const quote = cleaned[0];
  if (cleaned.length >= 2 && (quote === '"' || quote === "'") && cleaned.at(-1) === quote) cleaned = cleaned.slice(1, -1).trim();
  return cleaned === "" ? undefined : cleaned;
}

/** A case-insensitive option such as STORAGE_DRIVER=Blob, lower-cased; undefined when unset or empty. */
export function envOption(value: unknown): string | undefined {
  return cleanEnvValue(value)?.toLowerCase();
}

/** A boolean flag such as TRUST_PROXY: true for "true" or "1" (any case), false otherwise. */
export function envFlag(value: unknown): boolean {
  const option = envOption(value);
  return option === "true" || option === "1";
}
