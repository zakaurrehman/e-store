import { describe, expect, it } from "vitest";
import { createReferralCodes, setReferralCodeActive } from "@/features/referrals/service";
import { saveSettingsSection } from "@/features/settings/service";
import { openStoreForNewOwner, openStoreForUser } from "@/features/stores/onboarding";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { invitation } from "./helpers";

const password = "Correct-horse-battery-7";
let sequence = 0;

const owner = (referralCode?: string | null) => {
  sequence += 1;
  return openStoreForNewOwner({ storeName: `Invited ${sequence}`, firstName: "Ivy", lastName: "Invitee", email: `invitee.${sequence}.${Date.now()}@example.com`, password, referralCode });
};

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : "UNEXPECTED";
  }
};

async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({ where: { email: "referral.staff@example.com" }, create: { email: "referral.staff@example.com", firstName: "Ref", lastName: "Staff", roleId: role.id }, update: {} });
}

describe("invitation codes", () => {
  it("refuses to open a store without a code, or with one that does not exist", async () => {
    expect(await errorCode(owner(null))).toBe("REFERRAL_REQUIRED");
    expect(await errorCode(owner("   "))).toBe("REFERRAL_REQUIRED");
    expect(await errorCode(owner("ZD-00000000"))).toBe("REFERRAL_INVALID");
    // Nothing was created by the failed attempts.
    expect(await db.store.count({ where: { name: { startsWith: "Invited" } } })).toBe(0);
  });

  it("refuses expired, disabled and used-up codes", async () => {
    const expired = await invitation({ expiresAt: new Date(Date.now() - 60_000) });
    const disabled = await invitation({ isActive: false });
    const single = await invitation();
    expect(await errorCode(owner(expired))).toBe("REFERRAL_INVALID");
    expect(await errorCode(owner(disabled))).toBe("REFERRAL_INVALID");
    await owner(single);
    expect(await errorCode(owner(single))).toBe("REFERRAL_INVALID");
  });

  it("accepts a valid code however it is typed, and links the code, the owner and the store", async () => {
    const code = await invitation();
    const typed = code.replace("ZD-", "").toLowerCase(); // no prefix, lower case
    const { user, store } = await owner(typed);

    const redemption = await db.referralRedemption.findFirstOrThrow({ where: { userId: user.id }, include: { code: true } });
    expect(redemption.code.code).toBe(code);
    expect(redemption.storeId).toBe(store.id);
    expect(redemption.code.usedCount).toBe(1);
  });

  it("lets two people race for the last use of a code, and only one of them wins", async () => {
    const code = await invitation({ maxUses: 1 });
    const results = await Promise.allSettled([owner(code), owner(code), owner(code)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const row = await db.referralCode.findUniqueOrThrow({ where: { code } });
    expect(row.usedCount).toBe(1);
    expect(await db.referralRedemption.count({ where: { codeId: row.id } })).toBe(1);
  });

  it("supports campaign codes with several uses, and staff can generate and disable codes", async () => {
    const admin = await staff();
    const [campaign] = await createReferralCodes({ count: 1, maxUses: 2, expiresAt: null, label: "Expo" }, admin.id);
    await owner(campaign);
    await owner(campaign);
    expect(await errorCode(owner(campaign))).toBe("REFERRAL_INVALID");

    const batch = await createReferralCodes({ count: 5, maxUses: 1, expiresAt: new Date(Date.now() + 86_400_000) }, admin.id);
    expect(new Set(batch).size).toBe(5);
    for (const code of batch) expect(code).toMatch(/^ZD-[0-9A-HJKMNP-TV-Z]{8}$/);
    const row = await db.referralCode.findUniqueOrThrow({ where: { code: batch[0] } });
    await setReferralCodeActive(row.id, false, admin.id);
    expect(await errorCode(owner(batch[0]))).toBe("REFERRAL_INVALID");
    await setReferralCodeActive(row.id, true, admin.id);
    await owner(batch[0]);
  });

  it("asks a signed-in customer for a code too, but not staff", async () => {
    const customerRole = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
    const customer = await db.user.create({ data: { email: `customer.${Date.now()}@example.com`, firstName: "Cas", lastName: "Tomer", roleId: customerRole.id } });
    expect(await errorCode(openStoreForUser(customer.id, { storeName: "Customer store" }))).toBe("REFERRAL_REQUIRED");
    await openStoreForUser(customer.id, { storeName: "Customer store", referralCode: await invitation() });

    const admin = await staff();
    await openStoreForUser(admin.id, { storeName: "Staff test store" });
  });

  it("stops asking once staff switch invitations off", async () => {
    await saveSettingsSection("platform", { commissionRateBps: 1000, commissionBase: "ORDER_REVENUE", requireReferralCode: false });
    try {
      const { store } = await owner(null);
      expect(store.id).toBeTruthy();
    } finally {
      await saveSettingsSection("platform", { commissionRateBps: 1000, commissionBase: "ORDER_REVENUE", requireReferralCode: true });
    }
  });
});
