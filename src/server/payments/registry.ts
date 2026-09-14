import { env } from "@/server/env";
import { CashOnDeliveryProvider } from "./providers/cod";
import { PayPalProvider } from "./providers/paypal";
import { SandboxProvider } from "./providers/sandbox";
import { StripeProvider } from "./providers/stripe";
import type { PaymentProvider } from "./types";

let registry: Map<string, PaymentProvider> | undefined;

function build(): Map<string, PaymentProvider> {
  const providers = new Map<string, PaymentProvider>();
  for (const key of env.PAYMENT_PROVIDERS) {
    switch (key) {
      case "stripe":
        providers.set(key, new StripeProvider(env.STRIPE_SECRET_KEY!, env.STRIPE_WEBHOOK_SECRET!));
        break;
      case "paypal":
        providers.set(key, new PayPalProvider(env.PAYPAL_CLIENT_ID!, env.PAYPAL_CLIENT_SECRET!, env.PAYPAL_WEBHOOK_ID!, env.PAYPAL_MODE));
        break;
      case "cod":
        providers.set(key, new CashOnDeliveryProvider({ maxTotalCents: 200_000 }));
        break;
      case "sandbox":
        providers.set(key, new SandboxProvider(env.SANDBOX_PAYMENTS_SECRET!, env.APP_URL));
        break;
      default:
        console.warn(`[payments] unknown provider "${key}" in PAYMENT_PROVIDERS — ignored`);
    }
  }
  return providers;
}

export function listPaymentProviders(): PaymentProvider[] {
  registry ??= build();
  return [...registry.values()];
}

export function getPaymentProvider(key: string): PaymentProvider | null {
  registry ??= build();
  return registry.get(key) ?? null;
}

/** Test hook */
export function resetPaymentRegistry() {
  registry = undefined;
}

export type PaymentMethodOption = { key: string; label: string; description: string; flow: PaymentProvider["flow"] };

export function availablePaymentMethods(context: { country: string; totalCents: number; currency: string }): PaymentMethodOption[] {
  return listPaymentProviders()
    .filter((provider) => provider.isAvailable(context))
    .map((provider) => ({ key: provider.key, label: provider.label, description: provider.description, flow: provider.flow }));
}
