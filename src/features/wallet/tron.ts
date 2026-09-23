import "server-only";
import { createHash } from "node:crypto";
import { TRC20_ADDRESS_PATTERN } from "@/lib/tron";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(value: string): Uint8Array | null {
  let number = 0n;
  for (const char of value) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number % 256n));
    number /= 256n;
  }
  // Each leading "1" is a leading zero byte.
  for (const char of value) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest();

/**
 * A real TRON address, not just one that looks like it: 25 bytes once decoded — the 0x41 network byte,
 * 20 bytes of address and a 4-byte checksum that must match. A withdrawal cannot be recalled once sent,
 * so a single mistyped character is caught here rather than on the blockchain.
 */
export function isTrc20Address(value: string): boolean {
  const address = value.trim();
  if (!TRC20_ADDRESS_PATTERN.test(address)) return false;
  const bytes = base58Decode(address);
  if (!bytes || bytes.length !== 25 || bytes[0] !== 0x41) return false;
  const payload = bytes.subarray(0, 21);
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return checksum.every((byte, index) => byte === bytes[21 + index]);
}
