"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ingestImage } from "@/features/media/service";
import { DepositMethod, PayoutMethod } from "@/generated/prisma/enums";
import { assertStoreOwner } from "@/features/stores/guards";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { confirmDeposit, rejectDeposit, rejectPayout, markPayoutPaid, recordDeposit, requestPayout } from "./service";

/** "12.50", "$1,250" → cents. */
const amountSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .transform((value) => Number(value.replace(/[^0-9.]/g, "")))
  .pipe(z.number({ error: "Enter a valid amount." }).positive("Enter an amount above zero.").max(1_000_000, "Enter a smaller amount."))
  .transform((value) => Math.round(value * 100));

const payoutSchema = z.object({
  amount: amountSchema,
  method: z.enum(["BANK_TRANSFER", "PAYPAL"]),
  destination: z.string().trim().min(5, "Enter where the money should be sent.").max(200, "Keep this under 200 characters."),
  note: z.string().trim().max(300).optional().transform((value) => value || null),
});

const depositSchema = z.object({
  amount: amountSchema,
  method: z.enum(["BANK_TRANSFER", "CRYPTO"]),
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
    await markPayoutPaid(payoutId, admin.id, reference ?? null);
    revalidatePath("/admin/payouts");
    return success("Withdrawal marked as paid.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function rejectPayoutAction(payoutId: string, reason: string): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    await rejectPayout(payoutId, admin.id, String(reason ?? "").slice(0, 300));
    revalidatePath("/admin/payouts");
    return success("Withdrawal declined and the amount returned to the owner's balance.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function confirmDepositAction(depositId: string): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    const deposit = await confirmDeposit(depositId, admin.id);
    revalidatePath("/admin/payouts");
    return success(`Deposit of $${(deposit.amountCents / 100).toFixed(2)} confirmed and credited.`);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function rejectDepositAction(depositId: string, reason: string): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    await rejectDeposit(depositId, admin.id, String(reason ?? "").slice(0, 300));
    revalidatePath("/admin/payouts");
    return success("Deposit declined. Nothing was credited.");
  } catch (error) {
    return handleActionError(error);
  }
}
