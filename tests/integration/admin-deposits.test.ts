import { describe, expect, it } from "vitest";
import { getStoreForAdmin } from "@/features/admin/stores";
import { listDepositsForAdmin } from "@/features/admin/deposits";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { confirmDeposit, recordDeposit, rejectDeposit } from "@/features/wallet/service";
import { DepositStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { invitation } from "./helpers";

let sequence = 0;

async function owner() {
  sequence += 1;
  return openStoreForNewOwner({
    storeName: `Deposit Store ${sequence}`,
    firstName: "Dana",
    lastName: "Owner",
    email: `deposit.owner.${sequence}.${Date.now()}@example.com`,
    password: "Correct-horse-battery-7",
    referralCode: await invitation(),
  });
}

async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({
    where: { email: "deposit.staff@example.com" },
    create: { email: "deposit.staff@example.com", firstName: "Sam", lastName: "Staff", roleId: role.id },
    update: {},
  });
}

describe("the admin's deposit queue", () => {
  it("shows who sent the money, how to reach them, and what they attached", async () => {
    const { user, store } = await owner();
    await db.user.update({ where: { id: user.id }, data: { phone: "+13105551234" } });
    const proof = await db.mediaAsset.create({
      data: { storageKey: `deposits/${Date.now()}.webp`, url: "https://example.com/proof.webp", filename: "transfer.webp", mimeType: "image/webp", sizeBytes: 2048, width: 800, height: 600, folder: "deposits" },
    });
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 12_500, method: "BANK_TRANSFER", reference: `TOPUP-${sequence}-XYZ`, createdById: user.id, proofMediaId: proof.id });

    const row = (await listDepositsForAdmin()).deposits.find((item) => item.id === deposit.id);
    expect(row).toBeDefined();
    expect(row!.store.owner).toMatchObject({ email: user.email, phone: "+13105551234", firstName: "Dana" });
    expect(row!.store.name).toBe(store.name);
    expect(row!.amountCents).toBe(12_500);
    expect(row!.reference).toBe(`TOPUP-${sequence}-XYZ`);
    expect(row!.proof).toMatchObject({ url: "https://example.com/proof.webp", mimeType: "image/webp" });
    expect(row!.status).toBe(DepositStatus.PENDING);
    expect(row!.createdAt).toBeInstanceOf(Date);
    // Nothing is credited while it waits.
    expect(row!.entries).toHaveLength(0);
  });

  it("finds a deposit by reference, by store and by the owner's email, and counts each status", async () => {
    const mine = await owner();
    const theirs = await owner();
    const reference = `FINDME-${Date.now()}`;
    const found = await recordDeposit({ storeId: mine.store.id, amountCents: 5000, method: "BANK_TRANSFER", reference, createdById: mine.user.id });
    await recordDeposit({ storeId: theirs.store.id, amountCents: 7000, method: "BANK_TRANSFER", reference: "OTHER", createdById: theirs.user.id });

    for (const q of [reference, mine.store.name, mine.user.email]) {
      const results = await listDepositsForAdmin({ q });
      expect(results.deposits.map((row) => row.id)).toContain(found.id);
      expect(results.deposits.every((row) => row.storeId === mine.store.id)).toBe(true);
    }

    const staffUser = await staff();
    await confirmDeposit(found.id, staffUser.id);
    const counts = (await listDepositsForAdmin()).counts;
    expect(counts.approved.count).toBeGreaterThanOrEqual(1);
    expect(counts.pending.count).toBeGreaterThanOrEqual(1);
    // Filtering narrows to one status only.
    const pendingOnly = await listDepositsForAdmin({ status: DepositStatus.PENDING });
    expect(pendingOnly.deposits.every((row) => row.status === DepositStatus.PENDING)).toBe(true);
    expect(pendingOnly.deposits.map((row) => row.id)).not.toContain(found.id);
  });

  it("credits the amount that actually arrived, as one ledger entry with an audit trail", async () => {
    const { user, store } = await owner();
    const staffUser = await staff();
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 10_000, method: "BANK_TRANSFER", reference: "SHORT-1", createdById: user.id });

    // The bank shows $95, not the $100 declared: that is what goes onto the ledger.
    await confirmDeposit(deposit.id, staffUser.id, 9_500);

    const settled = (await listDepositsForAdmin({ q: "SHORT-1" })).deposits[0];
    expect(settled.status).toBe(DepositStatus.CONFIRMED);
    expect(settled.amountCents).toBe(9_500);
    expect(settled.confirmedBy?.firstName).toBe("Sam");
    expect(settled.entries).toHaveLength(1);
    expect(settled.entries[0].amountCents).toBe(9_500);

    const entries = await db.walletEntry.findMany({ where: { storeId: store.id, type: WalletEntryType.DEPOSIT } });
    expect(entries).toHaveLength(1);
    const audit = await db.auditLog.findFirst({ where: { entityType: "Deposit", entityId: deposit.id, action: "wallet.deposit.confirm" } });
    expect(audit?.actorId).toBe(staffUser.id);
    expect(audit?.summary).toContain("95.00");
  });

  it("credits nothing when a deposit is rejected, and keeps the reason", async () => {
    const { user, store } = await owner();
    const staffUser = await staff();
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 4000, method: "CRYPTO", network: "USDT (TRC20)", reference: "0xdeadbeef", createdById: user.id });

    await rejectDeposit(deposit.id, staffUser.id, "No transfer with this hash arrived");

    const row = (await listDepositsForAdmin({ status: DepositStatus.REJECTED })).deposits.find((item) => item.id === deposit.id);
    expect(row?.note).toBe("No transfer with this hash arrived");
    expect(row?.entries).toHaveLength(0);
    expect(await db.walletEntry.count({ where: { storeId: store.id } })).toBe(0);
  });
});

describe("the admin's store page", () => {
  it("puts the owner, the store, the money and the history in one place", async () => {
    const { user, store } = await owner();
    const staffUser = await staff();
    await db.user.update({ where: { id: user.id }, data: { phone: "+442071234567" } });
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 6000, method: "BANK_TRANSFER", reference: "HELLO-1", createdById: user.id });
    await confirmDeposit(deposit.id, staffUser.id);

    const detail = await getStoreForAdmin(store.id);
    expect(detail).not.toBeNull();
    expect(detail!.store.owner).toMatchObject({ email: user.email, phone: "+442071234567" });
    expect(detail!.store.name).toBe(store.name);
    expect(detail!.summary.balanceCents).toBe(6000);
    expect(detail!.store.deposits.map((row) => row.id)).toContain(deposit.id);
    expect(detail!.ledger.entries[0]).toMatchObject({ type: WalletEntryType.DEPOSIT, amountCents: 6000 });
    // The history carries what the owner and staff did, newest first.
    expect(detail!.activity.some((entry) => entry.action === "wallet.deposit.record")).toBe(true);
    expect(detail!.invitation).toBeTruthy();
  });

  it("never exposes anything that could be used to sign in as the owner", async () => {
    const { store } = await owner();
    const detail = await getStoreForAdmin(store.id);
    // The owner's record reaches the page without the password hash — there is no plaintext to leak.
    expect(detail!.store.owner).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(detail!.store.owner)).not.toMatch(/\$argon2/);
  });

  it("is nothing for a store that does not exist or was deleted", async () => {
    expect(await getStoreForAdmin("cmzzzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
    const { store } = await owner();
    await db.store.update({ where: { id: store.id }, data: { deletedAt: new Date() } });
    expect(await getStoreForAdmin(store.id)).toBeNull();
  });
});
