import { beforeAll, describe, expect, it, vi } from "vitest";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { db } from "@/server/db";
import { invitation } from "./helpers";

// The limits run on the database-backed store production uses, not the in-memory one the other tests use.
let guard: typeof import("@/features/stores/opening-guard");
let DomainError: typeof import("@/server/errors").DomainError;

beforeAll(async () => {
  vi.stubEnv("RATE_LIMIT_DRIVER", "postgres");
  vi.resetModules();
  guard = await import("@/features/stores/opening-guard");
  ({ DomainError } = await import("@/server/errors"));
  await db.rateLimitBucket.deleteMany({});
});

let sequence = 0;
const owner = async () => {
  sequence += 1;
  return { storeName: `Opening Store ${sequence}`, firstName: "Opa", lastName: `Owner${sequence}`, email: `opening.${sequence}.${Date.now()}@example.com`, password: "Correct-horse-battery-7", referralCode: await invitation() };
};
const wrongCode = () => new DomainError("REFERRAL_INVALID", "That invitation code doesn't exist.");

describe("opening stores", () => {
  it("lets several invited owners open stores one after another from the same network", async () => {
    const office = "203.0.113.10";
    for (let store = 0; store < 6; store += 1) {
      expect(await guard.storeOpeningRefusal(office)).toBeNull();
      const opened = await openStoreForNewOwner(await owner(), { ipAddress: office });
      expect(opened.store.id).toBeTruthy();
    }
    expect(await db.store.count({ where: { name: { startsWith: "Opening Store" } } })).toBe(6);
  });

  it("keeps each network's count to itself, and apart from customer sign-ups", async () => {
    const busy = "203.0.113.20";
    for (let attempt = 0; attempt < 20; attempt += 1) expect(await guard.storeOpeningRefusal(busy)).toBeNull();
    // Only a flood — the 21st opening within the hour from one network — is refused, with a clear reason.
    expect((await guard.storeOpeningRefusal(busy))?.message).toMatch(/Too many stores have been opened from your network in the last hour/);
    // Another network is untouched.
    expect(await guard.storeOpeningRefusal("203.0.113.21")).toBeNull();
    // Customer sign-ups count on their own: using them up does not stop anyone opening a store.
    const { rateLimitByIp } = await import("@/server/security/rate-limit");
    for (let signup = 0; signup < 6; signup += 1) await rateLimitByIp("register", "203.0.113.22");
    expect(await guard.storeOpeningRefusal("203.0.113.22")).toBeNull();
  });

  it("stops invitation-code guessing only after repeated wrong codes, on that network alone", async () => {
    const guesser = "203.0.113.30";
    for (let guess = 0; guess < 9; guess += 1) await guard.noteRefusedInvitation(wrongCode(), "ZD-00000000", guesser);
    expect(await guard.storeOpeningRefusal(guesser)).toBeNull();
    await guard.noteRefusedInvitation(wrongCode(), "ZD-00000000", guesser);
    const refusal = await guard.storeOpeningRefusal(guesser);
    expect(refusal?.message).toMatch(/Too many incorrect invitation codes/);
    expect(refusal?.field).toBe("referralCode");
    expect(await guard.invitationCheckRefusal(guesser)).toMatch(/Too many incorrect invitation codes/);
    // Someone else, on another network, is not affected.
    expect(await guard.storeOpeningRefusal("203.0.113.31")).toBeNull();
    expect(await guard.invitationCheckRefusal("203.0.113.31")).toBeNull();
  });

  it("counts neither a blank code nor any other mistake as guessing", async () => {
    const forgetful = "203.0.113.40";
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await guard.noteRefusedInvitation(wrongCode(), "", forgetful);
      await guard.noteRefusedInvitation(new DomainError("EMAIL_TAKEN", "That email is already registered."), "ZD-7K4P9X2M", forgetful);
    }
    expect(await guard.storeOpeningRefusal(forgetful)).toBeNull();
  });

  it("never pools visitors whose address is unknown into one shared limit", async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(await guard.storeOpeningRefusal("unknown")).toBeNull();
      await guard.noteRefusedInvitation(wrongCode(), "ZD-00000000", "unknown");
    }
    expect(await db.rateLimitBucket.count({ where: { key: { contains: "unknown" } } })).toBe(0);
  });
});
