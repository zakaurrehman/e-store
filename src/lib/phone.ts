/**
 * Phone numbers, in one place.
 *
 * Numbers are validated against the real numbering plan of the country they belong to (libphonenumber)
 * rather than a regex, and stored in E.164 (`+14155552671`) so that every screen, email and export shows
 * the same thing and an SMS provider could dial it.
 *
 * What this does NOT do: prove that the person typing owns the number. Only a one-time code sent to the
 * phone can do that. When SMS delivery is configured, `phoneNeedsVerification` marks where that check
 * would go — nothing in the platform currently claims a number is verified.
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type NormalisedPhone = {
  /** International form, e.g. +14155552671 — what is stored. */
  e164: string;
  /** Readable form, e.g. +1 415 555 2671 — what is shown. */
  international: string;
  country: string | null;
  type: string | null;
};

const asCountry = (value: string | null | undefined): CountryCode | undefined => {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? (code as CountryCode) : undefined;
};

/**
 * Parses a number the way a person would type it, using the delivery country when no country code is given.
 * Returns null when it is not a real, dialable number.
 */
export function normalisePhone(value: string | null | undefined, defaultCountry?: string | null): NormalisedPhone | null {
  const raw = value?.trim();
  if (!raw) return null;
  // Letters are never part of a number, and vanity numbers ("555-CAKE") are not dialable internationally.
  if (/[A-Za-z]/.test(raw)) return null;
  const parsed = parsePhoneNumberFromString(raw, asCountry(defaultCountry));
  if (!parsed || !parsed.isValid()) return null;
  return {
    e164: parsed.number,
    international: parsed.formatInternational(),
    country: parsed.country ?? null,
    type: parsed.getType() ?? null,
  };
}

export const isValidPhone = (value: string | null | undefined, defaultCountry?: string | null) => normalisePhone(value, defaultCountry) !== null;

/** Display helper: a stored E.164 number, spaced for reading. */
export const formatPhone = (value: string | null | undefined) => (value ? (normalisePhone(value)?.international ?? value) : "");

/**
 * True for every number the platform holds: a valid format is not proof of ownership. Confirming that
 * needs a one-time code, which requires an SMS provider (`src/server/notifications/channels.ts`).
 */
export const phoneNeedsVerification = () => true;

export const PHONE_ERROR = "Enter a valid phone number, including the country code.";
