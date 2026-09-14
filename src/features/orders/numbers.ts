import { randomInt } from "node:crypto";

/** Human-friendly, non-sequential order numbers: VY-K7M3-Q2X9 (no ambiguous characters). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateOrderNumber() {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `VY-${part()}-${part()}`;
}

export function isOrderNumber(value: string) {
  return /^VY-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(value.trim().toUpperCase());
}

export function normaliseOrderNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
