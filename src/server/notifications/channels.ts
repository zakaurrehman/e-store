/**
 * Outbound channel providers. Email is implemented (see src/server/email/provider.ts).
 * SMS and push share the same delivery outbox; plug a provider in here (e.g. Twilio, OneSignal) and
 * deliveries for those channels start sending without changes to the notification rules.
 */
export type SmsMessage = { to: string; body: string };
export type PushMessage = { to: string; title: string; body: string; href?: string };

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<{ id: string | null }>;
}

export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<{ id: string | null }>;
}

let smsProvider: SmsProvider | null = null;
let pushProvider: PushProvider | null = null;

export const getSmsProvider = () => smsProvider;
export const getPushProvider = () => pushProvider;

export function registerSmsProvider(provider: SmsProvider | null) {
  smsProvider = provider;
}

export function registerPushProvider(provider: PushProvider | null) {
  pushProvider = provider;
}
