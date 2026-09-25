"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { getRequestMeta } from "@/server/request";
import { invitationCheckRefusal, noteWrongInvitationCheck } from "@/features/stores/opening-guard";
import { normaliseReferralCode } from "./codes";
import { checkReferralCode, createReferralCodes, setReferralCodeActive } from "./service";

export type ReferralCheck = { ok: boolean; message: string | null };

/** Live feedback on the "create your store" form. Wrong codes count towards the guessing limit, so it cannot be used to hunt for codes. */
export async function checkReferralCodeAction(value: string): Promise<ReferralCheck> {
  const code = normaliseReferralCode(String(value ?? "").slice(0, 20));
  if (!code) return { ok: false, message: null };
  const meta = await getRequestMeta();
  const refusal = await invitationCheckRefusal(meta.ipAddress);
  if (refusal) return { ok: false, message: refusal };
  const result = await checkReferralCode(code);
  if (!result.ok) await noteWrongInvitationCheck(meta.ipAddress);
  return result.ok ? { ok: true, message: "Invitation accepted." } : { ok: false, message: result.message };
}

const createSchema = z.object({
  count: z.coerce.number().int().min(1, "Generate at least one code.").max(50, "Up to 50 at a time."),
  maxUses: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "unlimited" ? null : value ? Number(value) : 1))
    .pipe(z.number().int().min(1).max(1000).nullable()),
  expiresInDays: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().int().min(1).max(365).nullable()),
  label: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function createReferralCodesAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    count: formData.get("count") ?? 1,
    maxUses: formData.get("maxUses") ?? undefined,
    expiresInDays: formData.get("expiresInDays") ?? undefined,
    label: formData.get("label") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const admin = await assertPermission("stores.manage");
    const codes = await createReferralCodes(
      {
        count: parsed.data.count,
        maxUses: parsed.data.maxUses,
        expiresAt: parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000) : null,
        label: parsed.data.label,
        note: parsed.data.note,
      },
      admin.id,
    );
    revalidatePath("/admin/referrals");
    return success(codes.length === 1 ? `Invitation ${codes[0]} is ready.` : `${codes.length} invitation codes are ready.`);
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setReferralCodeActiveAction(codeId: string, isActive: boolean): Promise<ActionState> {
  try {
    const admin = await assertPermission("stores.manage");
    const code = await setReferralCodeActive(String(codeId).slice(0, 40), !!isActive, admin.id);
    revalidatePath("/admin/referrals");
    return success(isActive ? `${code.code} can be used again.` : `${code.code} is disabled.`);
  } catch (error) {
    return handleActionError(error);
  }
}

