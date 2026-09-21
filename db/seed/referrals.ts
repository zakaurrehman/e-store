import { generateReferralCode } from "@/features/referrals/codes";
import { db } from "@/server/db";

/**
 * Stores are invitation-only, so a fresh database needs one code to open the first store with.
 * Set SEED_REFERRAL_CODE to choose it (handy for tests); otherwise a random one is generated and printed.
 */
export async function seedReferralCode() {
  const existing = await db.referralCode.count();
  if (existing > 0) {
    console.log(`✓ invitations: ${existing} code(s) already exist`);
    return;
  }
  const code = (process.env.SEED_REFERRAL_CODE ?? generateReferralCode()).toUpperCase();
  await db.referralCode.create({ data: { code, label: "First invitation (seed)", maxUses: 5, note: "Created by the database seed." } });
  console.log(`✓ invitations: ${code} created (5 uses) — open a store with it at /start`);
}
