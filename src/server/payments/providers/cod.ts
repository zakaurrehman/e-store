import type { PaymentProvider } from "../types";

/** Cash on delivery: no online payment; the order is confirmed immediately and marked paid by staff. */
export class CashOnDeliveryProvider implements PaymentProvider {
  readonly key = "cod";
  readonly label = "Cash on delivery";
  readonly description = "Pay the courier in cash when your order arrives.";
  readonly flow = "offline" as const;

  constructor(private readonly options: { countries?: string[]; maxTotalCents?: number } = {}) {}

  isAvailable(context: { country: string; totalCents: number }) {
    if (this.options.countries && !this.options.countries.includes(context.country)) return false;
    if (this.options.maxTotalCents && context.totalCents > this.options.maxTotalCents) return false;
    return true;
  }

  async initiate() {
    return { kind: "offline" as const, providerReference: null };
  }

  async handleWebhook(): Promise<never> {
    throw new Error("Cash on delivery does not receive webhooks");
  }

  async refund() {
    // Cash refunds are handled manually; the ledger records them as pending manual settlement.
    return { transactionId: null, status: "pending" as const };
  }
}
