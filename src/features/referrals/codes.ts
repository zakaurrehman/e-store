/**
 * Invitation codes. Client-safe: pure functions only.
 *
 * A code is `ZD-` followed by eight characters drawn with `crypto.getRandomValues` from Crockford's
 * base32 alphabet — no I, L, O or U, so nothing is mistaken for a 1 or a 0 when read aloud or retyped.
 * Eight characters give 40 bits (over a trillion codes), which is not guessable: a code is a key, not a
 * counter, so 0001 or 76 could never happen.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_PREFIX = "ZD-";

/** Accepts what people actually type: lower case, missing prefix, spaces, and the classic I/1, O/0 mix-ups. */
export function normaliseReferralCode(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/^ZD/, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
  return cleaned ? `${REFERRAL_CODE_PREFIX}${cleaned.slice(0, REFERRAL_CODE_LENGTH)}` : "";
}

export function isReferralCodeShape(value: string) {
  const body = value.startsWith(REFERRAL_CODE_PREFIX) ? value.slice(REFERRAL_CODE_PREFIX.length) : value;
  return body.length === REFERRAL_CODE_LENGTH && [...body].every((character) => ALPHABET.includes(character));
}

/** A fresh code. Random, never sequential. */
export function generateReferralCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFERRAL_CODE_LENGTH));
  let body = "";
  for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
  return `${REFERRAL_CODE_PREFIX}${body}`;
}

export type ReferralCodeState = "ACTIVE" | "USED" | "EXPIRED" | "DISABLED";

export const REFERRAL_STATE_LABELS: Record<ReferralCodeState, string> = {
  ACTIVE: "Available",
  USED: "Used",
  EXPIRED: "Expired",
  DISABLED: "Disabled",
};

export const REFERRAL_STATE_TONES: Record<ReferralCodeState, "success" | "neutral" | "warning" | "danger"> = {
  ACTIVE: "success",
  USED: "neutral",
  EXPIRED: "warning",
  DISABLED: "danger",
};

export function referralCodeState(code: { isActive: boolean; expiresAt: Date | null; maxUses: number | null; usedCount: number }, now = new Date()): ReferralCodeState {
  if (!code.isActive) return "DISABLED";
  if (code.maxUses !== null && code.usedCount >= code.maxUses) return "USED";
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

export const referralUsesLabel = (code: { maxUses: number | null; usedCount: number }) =>
  code.maxUses === null ? `${code.usedCount} · unlimited` : `${code.usedCount} of ${code.maxUses}`;
