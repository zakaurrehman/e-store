import { describe, expect, it } from "vitest";
import { placeOrderSchema, validatedAddressSchema } from "@/features/checkout/schemas";
import { CANCELLABLE_STATUSES, CUSTOMER_STATUS_LABELS, NEXT_STATUSES, stepIndex } from "@/features/orders/status";
import { generateReferralCode, isReferralCodeShape, normaliseReferralCode, referralCodeState } from "@/features/referrals/codes";
import { formatPhone, isValidPhone, normalisePhone } from "@/lib/phone";

describe("phone numbers", () => {
  it("accepts real numbers and stores them in E.164", () => {
    expect(normalisePhone("+1 (415) 555-2671")?.e164).toBe("+14155552671");
    expect(normalisePhone("415 555 2671", "US")?.e164).toBe("+14155552671");
    expect(normalisePhone("+44 20 7946 0958")?.e164).toBe("+442079460958");
    expect(normalisePhone("050 123 4567", "AE")?.e164).toBe("+971501234567");
    expect(formatPhone("+14155552671")).toBe("+1 415 555 2671");
  });

  it("refuses text, fragments and numbers that cannot exist", () => {
    for (const value of ["hello", "12345", "((((", "+1 555", "555-CAKE", "+999 123 456 789", "0000000000"]) {
      expect(isValidPhone(value, "US"), value).toBe(false);
    }
    // A number is read against the country it is for.
    expect(isValidPhone("020 7946 0958", "US")).toBe(false);
    expect(isValidPhone("020 7946 0958", "GB")).toBe(true);
  });

  it("is checked at checkout and on addresses, against the delivery country", () => {
    const address = { firstName: "A", lastName: "B", line1: "1 Market St", city: "SF", postalCode: "94105", country: "US" };
    expect(validatedAddressSchema.safeParse({ ...address, phone: "not a phone" }).success).toBe(false);
    const parsed = validatedAddressSchema.safeParse({ ...address, phone: "(415) 555-2671" });
    expect(parsed.success && parsed.data.phone).toBe("+14155552671");

    const base = { idempotencyKey: "k".repeat(20), email: "a@example.com", shippingAddress: address, shippingMethodId: "m", paymentProvider: "cod" };
    expect(placeOrderSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    const order = placeOrderSchema.safeParse({ ...base, phone: "415-555-2671" });
    expect(order.success && order.data.phone).toBe("+14155552671");
    expect(placeOrderSchema.safeParse({ ...base }).success).toBe(true); // phone stays optional
  });
});

describe("invitation codes", () => {
  it("are random, unique-looking and never sequential", () => {
    const codes = Array.from({ length: 500 }, generateReferralCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^ZD-[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(isReferralCodeShape(code)).toBe(true);
    }
  });

  it("read the way people type them", () => {
    expect(normaliseReferralCode("zd-7k4p9x2m")).toBe("ZD-7K4P9X2M");
    expect(normaliseReferralCode("7k4p 9x2m")).toBe("ZD-7K4P9X2M");
    expect(normaliseReferralCode("ZD-7K4P9X2O")).toBe("ZD-7K4P9X20"); // O is read as zero
    expect(normaliseReferralCode("")).toBe("");
  });

  it("know when they can no longer be used", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    expect(referralCodeState({ isActive: true, expiresAt: null, maxUses: 1, usedCount: 0 }, now)).toBe("ACTIVE");
    expect(referralCodeState({ isActive: true, expiresAt: null, maxUses: 1, usedCount: 1 }, now)).toBe("USED");
    expect(referralCodeState({ isActive: true, expiresAt: new Date("2026-09-20T00:00:00Z"), maxUses: 1, usedCount: 0 }, now)).toBe("EXPIRED");
    expect(referralCodeState({ isActive: false, expiresAt: null, maxUses: null, usedCount: 0 }, now)).toBe("DISABLED");
    expect(referralCodeState({ isActive: true, expiresAt: null, maxUses: null, usedCount: 999 }, now)).toBe("ACTIVE");
  });
});

describe("order statuses", () => {
  it("only moves forward through fulfilment, and only through the funding check to be accepted", () => {
    expect(NEXT_STATUSES.CONFIRMED).toEqual(["ACCEPTED"]);
    expect(NEXT_STATUSES.AWAITING_FUNDS).toEqual(["ACCEPTED"]);
    expect(NEXT_STATUSES.ACCEPTED).toContain("PROCESSING");
    expect(NEXT_STATUSES.DELIVERED).toEqual([]);
    expect(NEXT_STATUSES.CANCELLED).toEqual([]);
    expect(NEXT_STATUSES.PENDING).not.toContain("SHIPPED");
    expect(CANCELLABLE_STATUSES).not.toContain("SHIPPED");
  });

  it("does not tell customers that a store is short of money", () => {
    expect(CUSTOMER_STATUS_LABELS.AWAITING_FUNDS).toBe("Confirmed");
    expect(stepIndex("AWAITING_FUNDS")).toBe(stepIndex("CONFIRMED"));
  });
});
