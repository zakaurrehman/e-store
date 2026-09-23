/**
 * USDT on the TRON network (TRC20). Shapes only — safe to use in the browser for instant feedback. The
 * server also checks an address's checksum (features/wallet/tron.ts) before money is sent to it.
 */

/** A TRON address: "T" followed by 33 base58 characters (no 0, O, I or l). */
export const TRC20_ADDRESS_PATTERN = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/** A TRON transaction id: 64 hexadecimal characters. */
export const TRC20_TXID_PATTERN = /^[0-9a-fA-F]{64}$/;

export const TRC20_LABEL = "USDT (TRC20)";

export const looksLikeTrc20Address = (value: string) => TRC20_ADDRESS_PATTERN.test(value.trim());
export const looksLikeTrc20TxId = (value: string) => TRC20_TXID_PATTERN.test(value.trim());
