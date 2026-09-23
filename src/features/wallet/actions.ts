"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { ingestImage } from "@/features/media/service";
import { DepositMethod, PayoutMethod, PayoutStatus } from "@/generated/prisma/enums";
import { acceptFundedOrders, flushNotifications } from "@/features/orders/service";
import { TRC20_ADDRESS_PATTERN } from "@/lib/tron";
import { assertStoreOwner } from "@/features/stores/guards";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { dispatchNotification, sendDeliveries, type NotificationEvent } from "@/server/notifications";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { confirmDeposit, rejectDeposit, rejectPayout, markPayoutPaid, recordDeposit, requestPayout, setPayoutStatus } from "./service";

/** Money events are emailed after the response, so a slow mail server never holds up the form. */
function notifyAfter(...events: NotificationEvent[]) {
  after(async () => {
    for (const event of events) {
      try {
        await sendDeliveries(await dispatchNotification(event));
      } catch (error) {
        console.error(`[wallet] ${event.type} notification failed`, error);
      }
    }
  });
}

/** "12.50", "$1,250" → cents. */
const amountSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .transform((value) => Number(value.replace(/[^0-9.]/g, "")))
  .pipe(z.number({ error: "Enter a valid amount." }).positive("Enter an amount above zero.").max(1_000_000, "Enter a smaller amount."))
  .transform((value) => Math.round(value * 100));

// Withdrawals are paid in USDT on TRC20 only; the service checks the address's checksum before anything moves.
const payoutSchema = z.object({
  amount: amountSchema,
  method: z.literal("USDT_TRC20", { error: "Withdrawals are paid in USDT (TRC20) only." }),
  destination: z.string().trim().regex(TRC20_ADDRESS_PATTERN, "Enter your TRC20 address: it starts with T and is 34 characters long."),
  note: z.string().trim().max(300).optional().transform((value) => value || null),
});

const depositSchema = z.object({
  amount: amountSchema,
  method: z.enum(["BANK_TRANSFER", "CRYPTO", "USDT_TRC20"]),
  network: z.string().trim().max(60).optional().transform((value) => value || null),
  reference: z.string().trim().max(120).optional().transform((value) => value || null),
  note: z.string().trim().max(300).optional().transform((value) => value || null),
});

export async function requestPayoutAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = payoutSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    destination: formData.get("destination"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const { user, store } = await assertStoreOwner();
    const payout = await requestPayout({
      storeId: store.id,
      amountCents: parsed.data.amount,
      method: parsed.data.method as PayoutMethod,
      destination: parsed.data.destination,
      note: parsed.data.note,
      requestedById: user.id,
    });
    notifyAfter({ type: "wallet.payout-requested", payoutId: payout.id });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/balance");
    return success(`Withdrawal of $${(payout.amountCents / 100).toFixed(2)} requested. Zendropship will send it to you and mark it paid here.`);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function recordDepositAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = depositSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    network: formData.get("network") ?? undefined,
    reference: formData.get("reference") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const { user, store } = await assertStoreOwner();

    // Optional proof: a screenshot of the transfer, validated and re-encoded like any other upload.
    let proofMediaId: string | null = null;
    const proof = formData.get("proof");
    if (proof instanceof File && proof.size > 0) {
      const limit = await rateLimit("upload", user.id);
      if (!limit.success) return failure(retryAfterMessage(limit.resetAt));
      try {
        const asset = await ingestImage({
          buffer: Buffer.from(await proof.arrayBuffer()),
          filename: proof.name,
          folder: "deposits",
          alt: `Deposit proof from ${store.name}`,
          uploadedById: user.id,
          maxDimension: 1600,
        });
        proofMediaId = asset.id;
      } catch (error) {
        return handleActionError(error);
      }
    }

    const deposit = await recordDeposit({
      storeId: store.id,
      amountCents: parsed.data.amount,
      method: parsed.data.method as DepositMethod,
      network: parsed.data.network,
      reference: parsed.data.reference,
      note: parsed.data.note,
      proofMediaId,
      createdById: user.id,
    });
    notifyAfter({ type: "wallet.deposit-submitted", depositId: deposit.id });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/balance");
    return success(`Deposit of $${(deposit.amountCents / 100).toFixed(2)} recorded. It is added to your balance once Zendropship confirms the transfer arrived.`);
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function markPayoutPaidAction(payoutId: string, reference?: string): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    const payout = await markPayoutPaid(payoutId, admin.id, reference ?? null);
    notifyAfter({ type: "wallet.payout-settled", payoutId: payout.id, paid: true });
    revalidatePath("/admin/payouts");
    return success("Withdrawal marked as paid.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Moves a withdrawal through checking and sending, before the money actually leaves. */
export async function setPayoutStatusAction(payoutId: string, status: "APPROVED" | "PROCESSING"): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    if (status !== PayoutStatus.APPROVED && status !== PayoutStatus.PROCESSING) return failure("Unknown status.");
    await setPayoutStatus(payoutId, status, admin.id);
    revalidatePath("/admin/payouts");
    return success(status === PayoutStatus.APPROVED ? "Withdrawal approved — send the money, then mark it paid." : "Withdrawal marked as being sent.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function rejectPayoutAction(payoutId: string, reason: string): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    const payout = await rejectPayout(payoutId, admin.id, String(reason ?? "").slice(0, 300));
    notifyAfter({ type: "wallet.payout-settled", payoutId: payout.id, paid: false });
    revalidatePath("/admin/payouts");
    return success("Withdrawal declined and the amount returned to the owner's balance.");
  } catch (error) {
    return handleActionError(error);
  }
}

/**
 * Approves a declared deposit and credits the owner's wallet in the same transaction, as one ledger
 * entry with an audit record behind it. `amountCents` is for when what arrived differs from what the
 * owner declared — leave it out to credit the declared amount.
 */
export async function confirmDepositAction(depositId: string, amountCents?: number): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents <= 0)) return failure("Enter the amount that actually arrived.");
    const deposit = await confirmDeposit(depositId, admin.id, amountCents);
    // Money has arrived: anything that was waiting for funds can go to fulfilment now.
    const resumed = await acceptFundedOrders(deposit.storeId);
    after(() => flushNotifications(resumed));
    notifyAfter({ type: "wallet.deposit-settled", depositId: deposit.id, confirmed: true });
    revalidatePath("/admin/deposits");
    revalidatePath("/admin/payouts");
    revalidatePath(`/admin/stores/${deposit.storeId}`);
    revalidatePath("/admin/orders");
    const credited = `$${(deposit.amountCents / 100).toFixed(2)} credited to the owner's balance.`;
    return success(resumed.length > 0 ? `${credited} ${resumed.length} order(s) waiting for funds have been dealt with.` : credited);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function rejectDepositAction(depositId: string, reason: string): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    const deposit = await rejectDeposit(depositId, admin.id, String(reason ?? "").slice(0, 300));
    notifyAfter({ type: "wallet.deposit-settled", depositId: deposit.id, confirmed: false });
    revalidatePath("/admin/deposits");
    revalidatePath("/admin/payouts");
    revalidatePath(`/admin/stores/${deposit.storeId}`);
    return success("Deposit rejected. Nothing was credited.");
  } catch (error) {
    return handleActionError(error);
  }
}

const creditSchema = z.object({
  storeId: z.string().min(1).max(40),
  amount: amountSchema,
  reference: z.string().trim().max(120).optional().transform((value) => value || null),
  reason: z.string().trim().min(3, "Say what this credit is for.").max(300),
});

/**
 * Staff put money into an owner's balance themselves — a transfer that arrived without the owner
 * recording it, or one they are owed. It goes through the same two steps as any other deposit, so it
 * appears in their deposit history, lands on the ledger once with an audit record behind it, and
 * releases anything of theirs that was waiting for funds. There is no path here that writes a balance.
 */
export async function creditStoreWalletAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = creditSchema.safeParse({
    storeId: formData.get("storeId"),
    amount: formData.get("amount"),
    reference: formData.get("reference") ?? undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const admin = await assertPermission("stores.manage");
    const store = await db.store.findFirst({ where: { id: parsed.data.storeId, deletedAt: null }, select: { id: true, name: true, ownerId: true } });
    if (!store) return failure("Store not found.");
    if (!store.ownerId) return failure("The platform's own store has no balance to credit.");

    const deposit = await recordDeposit({
      storeId: store.id,
      amountCents: parsed.data.amount,
      method: DepositMethod.BANK_TRANSFER,
      reference: parsed.data.reference,
      note: `Credited by Zendropship staff — ${parsed.data.reason}`,
      createdById: admin.id,
    });
    await confirmDeposit(deposit.id, admin.id, parsed.data.amount);

    // Money has arrived: anything that was waiting for funds can go to fulfilment now.
    const resumed = await acceptFundedOrders(store.id);
    after(() => flushNotifications(resumed));
    notifyAfter({ type: "wallet.deposit-settled", depositId: deposit.id, confirmed: true });
    revalidatePath(`/admin/stores/${store.id}`);
    revalidatePath("/admin/deposits");
    revalidatePath("/admin/orders");
    const credited = `$${(parsed.data.amount / 100).toFixed(2)} credited to ${store.name}.`;
    return success(resumed.length > 0 ? `${credited} ${resumed.length} order(s) waiting for funds have been dealt with.` : credited);
  } catch (error) {
    return handleActionError(error);
  }
}
