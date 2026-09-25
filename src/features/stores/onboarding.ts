import { Prisma } from "@/generated/prisma/client";
import { TokenType } from "@/generated/prisma/enums";
import { createToken } from "@/features/auth/service";
import { attachReferralStore, redeemReferralCode, referralRequired } from "@/features/referrals/service";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { createStore, StoreError } from "./service";

export type OpenStoreInput = { storeName: string; slug?: string; firstName: string; lastName: string; email: string; password: string; referralCode?: string | null };

function slugTaken(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const takenError = () => new StoreError("SLUG_TAKEN", "That store address was just taken. Try another.", { fieldErrors: { slug: ["That address is taken — try another."] } });

/**
 * A new visitor becomes a store owner in one step: their account and their store are created together, so the
 * store is live the moment the form is submitted. The owner then confirms their email from the welcome message.
 */
export async function openStoreForNewOwner(input: OpenStoreInput, meta: { ipAddress?: string } = {}) {
  const needsCode = await referralRequired();
  if (needsCode && !input.referralCode?.trim()) {
    throw new StoreError("REFERRAL_REQUIRED", "Zendropship stores are invitation-only. Enter the invitation code you were given.", {
      fieldErrors: { referralCode: ["Enter your invitation code."] },
    });
  }
  const problem = passwordProblem(input.password, { email: input.email });
  if (problem) throw new StoreError("PASSWORD_WEAK", problem, { fieldErrors: { password: [problem] } });
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new StoreError("EMAIL_TAKEN", "An account with this email already exists. Sign in to open your store.", {
      fieldErrors: { email: ["An account with this email already exists — sign in instead."] },
    });
  }
  const role = await db.role.findUniqueOrThrow({ where: { key: "STORE_OWNER" } });
  const passwordHash = await hashPassword(input.password);
  try {
    const { user, store, referral } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName, roleId: role.id } });
      // The invitation is claimed in the same transaction as the account and the store: if anything fails,
      // the code is not used up, and two people cannot share the last use of one code.
      const referral = input.referralCode?.trim() ? await redeemReferralCode(tx, input.referralCode, { userId: user.id, ipAddress: meta.ipAddress }) : null;
      const store = await createStore({ ownerId: user.id, name: input.storeName, slug: input.slug, supportEmail: input.email }, tx);
      if (referral) await attachReferralStore(tx, referral.id, user.id, store.id);
      return { user, store, referral };
    });
    const verificationToken = await createToken(user.id, TokenType.EMAIL_VERIFICATION);
    await writeAudit({
      actorId: user.id,
      action: "user.register",
      entityType: "User",
      entityId: user.id,
      summary: `Store owner registered (${store.slug})${referral ? ` with invitation ${referral.code}` : ""}`,
      ipAddress: meta.ipAddress,
    });
    return { user, store, verificationToken };
  } catch (error) {
    if (slugTaken(error)) throw takenError();
    throw error;
  }
}

/** A signed-in customer opens a store; their account becomes a store-owner account. Staff keep their staff role. */
export async function openStoreForUser(userId: string, input: { storeName: string; slug?: string; referralCode?: string | null }, meta: { ipAddress?: string } = {}) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  // Staff open stores without an invitation; everyone else needs one while the platform is invite-only. An
  // invitation already used counts only while its store exists: once staff delete a store, its former owner
  // needs a new invitation to open another.
  const usedInvitation = await db.referralRedemption.findFirst({ where: { userId, OR: [{ storeId: null }, { store: { deletedAt: null } }] }, select: { id: true } });
  const needsCode = !user.role.isStaff && (await referralRequired()) && !usedInvitation;
  if (needsCode && !input.referralCode?.trim()) {
    throw new StoreError("REFERRAL_REQUIRED", "Zendropship stores are invitation-only. Enter the invitation code you were given.", {
      fieldErrors: { referralCode: ["Enter your invitation code."] },
    });
  }
  try {
    return await db.$transaction(async (tx) => {
      const referral = input.referralCode?.trim() ? await redeemReferralCode(tx, input.referralCode, { userId: user.id, ipAddress: meta.ipAddress }) : null;
      const store = await createStore({ ownerId: user.id, name: input.storeName, slug: input.slug, supportEmail: user.email }, tx);
      if (referral) await attachReferralStore(tx, referral.id, user.id, store.id);
      if (user.role.key === "CUSTOMER") {
        const ownerRole = await tx.role.findUniqueOrThrow({ where: { key: "STORE_OWNER" } });
        await tx.user.update({ where: { id: user.id }, data: { roleId: ownerRole.id } });
      }
      return store;
    });
  } catch (error) {
    if (slugTaken(error)) throw takenError();
    throw error;
  }
}
