import { describe, expect, it } from "vitest";
import { isTrc20Address } from "@/features/wallet/tron";
import { looksLikeTrc20Address, looksLikeTrc20TxId } from "@/lib/tron";

// The USDT contract on TRON: a real address whose checksum is known to be right.
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("TRC20 addresses", () => {
  it("accepts a real TRON address, with spaces around it", () => {
    expect(isTrc20Address(USDT_CONTRACT)).toBe(true);
    expect(isTrc20Address(`  ${USDT_CONTRACT} `)).toBe(true);
    expect(looksLikeTrc20Address(USDT_CONTRACT)).toBe(true);
  });

  it("refuses an address with one character wrong, even though it looks right", () => {
    const typo = USDT_CONTRACT.slice(0, 10) + (USDT_CONTRACT[10] === "8" ? "9" : "8") + USDT_CONTRACT.slice(11);
    expect(looksLikeTrc20Address(typo)).toBe(true);
    expect(isTrc20Address(typo)).toBe(false);
  });

  it("refuses what is not a TRON address at all", () => {
    for (const value of ["", "owner@example.com", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", "IBAN GB00 0000", USDT_CONTRACT.slice(0, 33), `${USDT_CONTRACT}x`, USDT_CONTRACT.replace("T", "A")]) {
      expect(isTrc20Address(value)).toBe(false);
    }
  });

  it("recognises a transaction id by its 64 hexadecimal characters", () => {
    expect(looksLikeTrc20TxId("a".repeat(64))).toBe(true);
    expect(looksLikeTrc20TxId("0123456789abcdefABCDEF0123456789abcdef0123456789abcdef0123456789")).toBe(true);
    expect(looksLikeTrc20TxId("0xabc123")).toBe(false);
    expect(looksLikeTrc20TxId("g".repeat(64))).toBe(false);
  });
});
