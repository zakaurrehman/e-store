import { webPushProvider } from "./web-push";

/**
 * Outbound channel providers. Email is implemented (see src/server/email/provider.ts), and push goes out as
 * Web Push (see web-push.ts). SMS shares the same delivery outbox; plug a provider in here (e.g. Twilio) and
 * deliveries for it start sending without changes to the notification rules.
 */
export type SmsMessage = { to: string; body: string };
/** `to` is a PushSubscription id. `tag` groups alerts about the same thing (one per support conversation). */
export type PushMessage = { to: string; title: string; body: string; href?: string; tag?: string };
/** `skipped` explains a delivery that could not go anywhere (the device is gone) and should not be retried. */
export type PushResult = { id: string | null; skipped?: string };

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<{ id: string | null }>;
}

export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}

let smsProvider: SmsProvider | null = null;
let pushProvider: PushProvider | null = null;

export const getSmsProvider = () => smsProvider;
/** Web Push unless another provider has been registered (tests register one that records what it sends). */
export const getPushProvider = (): PushProvider => pushProvider ?? webPushProvider;

export function registerSmsProvider(provider: SmsProvider | null) {
  smsProvider = provider;
}

/** Replaces the push provider; null puts Web Push back. */
export function registerPushProvider(provider: PushProvider | null) {
  pushProvider = provider;
}
