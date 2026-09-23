/**
 * How deposits and withdrawals were sent, in words — one place, so every screen and email says the same.
 * Older records keep the method they were made with (bank transfer, PayPal, other crypto) and still read.
 */

export function depositMethodLabel(deposit: { method: string; network?: string | null }) {
  if (deposit.method === "USDT_TRC20") return "Binance · USDT (TRC20)";
  if (deposit.method === "CRYPTO") return deposit.network || "Crypto";
  return "Bank transfer";
}

export function payoutMethodLabel(method: string) {
  if (method === "USDT_TRC20") return "USDT (TRC20)";
  if (method === "PAYPAL") return "PayPal";
  return "Bank transfer";
}

/** Where staff can look a TRC20 transaction up, to see the money really moved. */
export const tronscanTransactionUrl = (txid: string) => `https://tronscan.org/#/transaction/${txid.trim()}`;
