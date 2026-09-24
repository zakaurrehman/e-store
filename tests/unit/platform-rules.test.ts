import { describe, expect, it } from "vitest";
import { placeOrderSchema, validatedAddressSchema } from "@/features/checkout/schemas";
import { fulfilmentHint, fulfilmentProgress, isFulfilmentComplete, nextFulfilmentStep } from "@/features/orders/progress";
import { CANCELLABLE_STATUSES, CUSTOMER_STATUS_LABELS, NEXT_STATUSES, stepIndex, WAITING_FOR_ACCEPTANCE } from "@/features/orders/status";
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
  it("only moves forward through fulfilment, and is accepted only from waiting for the owner", () => {
    expect(NEXT_STATUSES.CONFIRMED).toEqual(["ACCEPTED"]);
    expect(NEXT_STATUSES.AWAITING_FUNDS).toEqual(["ACCEPTED"]);
    expect(NEXT_STATUSES.ACCEPTED).toContain("PROCESSING");
    expect(NEXT_STATUSES.DELIVERED).toEqual([]);
    expect(NEXT_STATUSES.CANCELLED).toEqual([]);
    expect(NEXT_STATUSES.PENDING).not.toContain("SHIPPED");
    expect(CANCELLABLE_STATUSES).not.toContain("SHIPPED");
    // Confirmed orders (and old ones left waiting for funds) are the ones waiting for the owner to accept.
    expect(WAITING_FOR_ACCEPTANCE).toEqual(["CONFIRMED", "AWAITING_FUNDS"]);
  });

  it("does not tell customers that a store is short of money", () => {
    expect(CUSTOMER_STATUS_LABELS.AWAITING_FUNDS).toBe("Confirmed");
    expect(stepIndex("AWAITING_FUNDS")).toBe(stepIndex("CONFIRMED"));
  });
});

describe("the fulfilment queue", () => {
  const at = (iso: string) => new Date(iso);
  const events = [
    { type: "CREATED", message: "Order placed", data: null, createdAt: at("2026-09-20T10:00:00Z") },
    { type: "STATUS_CHANGED", message: "Order confirmed", data: { status: "CONFIRMED" }, createdAt: at("2026-09-20T10:01:00Z") },
    { type: "STATUS_CHANGED", message: "Accepted by the store owner", data: { status: "ACCEPTED" }, createdAt: at("2026-09-20T10:02:00Z"), actor: { firstName: "Olu", lastName: "Owner" } },
    { type: "STATUS_CHANGED", message: "Status changed to Processing", data: { status: "PROCESSING" }, createdAt: at("2026-09-20T11:00:00Z"), actor: { firstName: "Noor", lastName: "Staff" } },
  ];

  const ownerStore = { ownerAccepts: true };
  const platformStore = { ownerAccepts: false };

  it("offers one obvious next step per stage, and none once the order is finished or cancelled", () => {
    expect(nextFulfilmentStep("ACCEPTED", ownerStore)?.status).toBe("PROCESSING");
    expect(nextFulfilmentStep("PROCESSING", ownerStore)?.status).toBe("PACKED");
    expect(nextFulfilmentStep("PACKED", ownerStore)?.status).toBe("SHIPPED");
    expect(nextFulfilmentStep("SHIPPED", ownerStore)?.status).toBe("OUT_FOR_DELIVERY");
    expect(nextFulfilmentStep("OUT_FOR_DELIVERY", ownerStore)?.status).toBe("DELIVERED");
    expect(nextFulfilmentStep("DELIVERED", ownerStore)).toBeNull();
    expect(nextFulfilmentStep("CANCELLED", ownerStore)).toBeNull();
    expect(nextFulfilmentStep("PENDING", ownerStore)).toBeNull(); // the customer's payment comes first
    // Every suggested step is one the rules actually allow.
    for (const status of Object.keys(NEXT_STATUSES) as Array<keyof typeof NEXT_STATUSES>) {
      for (const store of [ownerStore, platformStore]) {
        const next = nextFulfilmentStep(status, store);
        if (next) expect(NEXT_STATUSES[status]).toContain(next.status);
      }
    }
  });

  it("gives staff no Accept on an owner's order — only on an order in Zendropship's own store", () => {
    expect(nextFulfilmentStep("CONFIRMED", ownerStore)).toBeNull();
    expect(nextFulfilmentStep("AWAITING_FUNDS", ownerStore)).toBeNull();
    expect(fulfilmentHint("CONFIRMED", ownerStore)).toBe("Waiting for the store owner to accept");
    expect(fulfilmentHint("AWAITING_FUNDS", ownerStore)).toBe("Waiting for the store owner to accept");
    expect(nextFulfilmentStep("CONFIRMED", platformStore)?.status).toBe("ACCEPTED");
    expect(fulfilmentHint("CONFIRMED", platformStore)).toBe("Next: Accepted");
  });

  it("builds the timeline from the order's own events, with who moved it", () => {
    const stages = fulfilmentProgress({ status: "PROCESSING", placedAt: at("2026-09-20T10:00:00Z"), deliveredAt: null, events });
    const done = stages.filter((stage) => stage.done);
    expect(done.map((stage) => stage.status)).toEqual(["PENDING", "CONFIRMED", "ACCEPTED", "PROCESSING"]);
    expect(done.every((stage) => stage.at !== null)).toBe(true);
    expect(stages.find((stage) => stage.status === "PROCESSING")?.by).toBe("Noor Staff");
    expect(stages.find((stage) => stage.status === "ACCEPTED")?.by).toBe("Olu Owner");
    expect(stages.find((stage) => stage.status === "PROCESSING")?.current).toBe(true);
    expect(stages.find((stage) => stage.status === "PACKED")?.at).toBeNull();
    expect(isFulfilmentComplete("PROCESSING")).toBe(false);
    expect(isFulfilmentComplete("DELIVERED")).toBe(true);
  });

  it("shows nothing as reached once an order is cancelled", () => {
    const stages = fulfilmentProgress({ status: "CANCELLED", placedAt: at("2026-09-20T10:00:00Z"), deliveredAt: null, events });
    expect(stages.some((stage) => stage.done)).toBe(false);
    expect(fulfilmentHint("CANCELLED", ownerStore)).toMatch(/Cancelled/);
    expect(fulfilmentHint("DELIVERED", ownerStore)).toMatch(/complete/);
    expect(fulfilmentHint("ACCEPTED", ownerStore)).toBe("Next: Processing");
  });
});
