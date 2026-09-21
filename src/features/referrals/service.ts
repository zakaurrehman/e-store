import "server-only";
import { loadSettings } from "@/features/settings/service";
import { writeAudit } from "@/server/audit";
import { db, type DbClient, type Tx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { generateReferralCode, normaliseReferralCode, referralCodeState } from "./codes";

export * from "./codes";

export class ReferralError extends DomainError {}

const invalid = (message: string) => new ReferralError("REFERRAL_INVALID", message, { fieldErrors: { referralCode: [message] } });

/** Invite-only while the platform setting says so. */
export async function referralRequired(client: DbClient = db) {
  return (await loadSettings(client)).platform.requireReferralCode;
}

/** Looks a code up without using it — for the live check on the "create your store" form. */
export async function checkReferralCode(value: string, client: DbClient = db) {
  const code = normaliseReferralCode(value);
  if (!code) return { ok: false as const, message: "Enter your invitation code." };
  const row = await client.referralCode.findUnique({ where: { code } });
  if (!row) return { ok: false as const, message: "That invitation code doesn't exist." };
  const state = referralCodeState(row);
  if (state === "DISABLED") return { ok: false as const, message: "That invitation code has been withdrawn." };
  if (state === "EXPIRED") return { ok: false as const, message: "That invitation code has expired." };
  if (state === "USED") return { ok: false as const, message: "That invitation code has already been used." };
  return { ok: true as const, code: row.code, label: row.label };
}

/**
 * Claims one use of a code inside the transaction that creates the store, so the same code cannot be used
 * twice by two people submitting at the same moment: the increment is conditional on there being a use left,
 * and a code with none left updates no rows.
 */
export async function redeemReferralCode(tx: Tx, value: string, context: { userId: string; storeId?: string | null; ipAddress?: string | null }) {
  const code = normaliseReferralCode(value);
  if (!code) throw invalid("Enter your invitation code.");
  const row = await tx.referralCode.findUnique({ where: { code } });
  if (!row) throw invalid("That invitation code doesn't exist.");
  const state = referralCodeState(row);
  if (state === "DISABLED") throw invalid("That invitation code has been withdrawn.");
  if (state === "EXPIRED") throw invalid("That invitation code has expired.");
  if (state === "USED") throw invalid("That invitation code has already been used.");

  const claimed = await tx.referralCode.updateMany({
    where: {
      id: row.id,
      isActive: true,
      OR: [{ maxUses: null }, { usedCount: { lt: tx.referralCode.fields.maxUses } }],
    },
    data: { usedCount: { increment: 1 } },
  });
  if (claimed.count === 0) throw invalid("That invitation code has just been used by someone else.");

  await tx.referralRedemption.create({ data: { codeId: row.id, userId: context.userId, storeId: context.storeId ?? null, ipAddress: context.ipAddress ?? null } });
  return row;
}

/** Links the redemption to the store once it exists (the code is claimed before the store row is created). */
export async function attachReferralStore(tx: Tx, codeId: string, userId: string, storeId: string) {
  await tx.referralRedemption.updateMany({ where: { codeId, userId, storeId: null }, data: { storeId } });
}

export type CreateCodesInput = { count: number; maxUses: number | null; expiresAt: Date | null; label?: string | null; note?: string | null };

/** Generates codes for staff to hand out. Retries on the astronomically unlikely collision. */
export async function createReferralCodes(input: CreateCodesInput, actorId: string) {
  const count = Math.min(50, Math.max(1, Math.trunc(input.count)));
  const created: string[] = [];
  for (let index = 0; index < count; index += 1) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateReferralCode();
      const exists = await db.referralCode.findUnique({ where: { code }, select: { id: true } });
      if (exists) continue;
      await db.referralCode.create({
        data: {
          code,
          label: input.label?.trim() || null,
          note: input.note?.trim() || null,
          maxUses: input.maxUses === null ? null : Math.max(1, Math.trunc(input.maxUses)),
          expiresAt: input.expiresAt,
          createdById: actorId,
        },
      });
      created.push(code);
      break;
    }
  }
  if (created.length === 0) throw new ReferralError("REFERRAL_CREATE_FAILED", "Could not generate a code. Please try again.");
  await writeAudit({ actorId, action: "referral.create", entityType: "ReferralCode", summary: `${created.length} invitation code(s) created` });
  return created;
}

export async function setReferralCodeActive(codeId: string, isActive: boolean, actorId: string) {
  const code = await db.referralCode.update({ where: { id: codeId }, data: { isActive } });
  await writeAudit({ actorId, action: isActive ? "referral.enable" : "referral.disable", entityType: "ReferralCode", entityId: code.id, summary: `${code.code} ${isActive ? "enabled" : "disabled"}` });
  return code;
}
