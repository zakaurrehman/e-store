import { describe, expect, it } from "vitest";
import { activeFilterCount, filtersToSearchParams, parseListingFilters } from "@/features/catalog/filters";
import { safeRedirectPath } from "@/features/auth/schemas";
import { passwordProblem, hashPassword, verifyPassword } from "@/server/auth/password";
import { signValue, unsignValue } from "@/server/security/crypto";
import { discountPercent, formatMoney, parseMoneyToCents } from "@/utils/money";
import { slugify, uniqueSlug } from "@/utils/slug";

describe("money", () => {
  it("formats cents as currency", () => {
    expect(formatMoney(129900)).toBe("$1,299.00");
    expect(formatMoney(5)).toBe("$0.05");
  });

  it("parses user input into cents", () => {
    expect(parseMoneyToCents("$1,299.50")).toBe(129950);
    expect(parseMoneyToCents("12.5")).toBe(1250);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
  });

  it("rounds discount percentage down", () => {
    expect(discountPercent(39500, 31600)).toBe(20);
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });
});

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("Girls’ Light Denim Jacket")).toBe("girls-light-denim-jacket");
    expect(slugify("Hearth & Form")).toBe("hearth-and-form");
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
    expect(slugify("   ")).toBe("item");
  });

  it("appends a counter until the slug is unique", async () => {
    const taken = new Set(["tee", "tee-2"]);
    expect(await uniqueSlug("Tee", async (candidate) => taken.has(candidate))).toBe("tee-3");
  });
});

describe("listing filters", () => {
  it("parses and normalises search params", () => {
    const filters = parseListingFilters({ brand: "orovia,Tempo-Nord,bad slug!", colour: "gold", price: "50-200", rating: "4", stock: "1", page: "3", sort: "price-asc" });
    expect(filters.brands).toEqual(["orovia", "tempo-nord"]);
    expect(filters.attributes).toEqual({ colour: ["gold"] });
    expect(filters.priceMin).toBe(5000);
    expect(filters.priceMax).toBe(20000);
    expect(filters.rating).toBe(4);
    expect(filters.inStock).toBe(true);
    expect(filters.page).toBe(3);
    expect(filters.sort).toBe("price-asc");
    expect(activeFilterCount(filters)).toBe(6);
  });

  it("defaults to relevance for searches and rejects unknown sorts", () => {
    expect(parseListingFilters({ q: "watch" }).sort).toBe("relevance");
    expect(parseListingFilters({ sort: "drop-table" }).sort).toBe("featured");
  });

  it("round-trips through URL params, omitting defaults", () => {
    const filters = parseListingFilters({ brand: "orovia", size: "m,l", sale: "1" });
    const params = filtersToSearchParams(filters);
    expect(params.toString()).toBe("brand=orovia&size=l%2Cm&sale=1");
    expect(parseListingFilters(Object.fromEntries(params))).toEqual(filters);
  });
});

describe("safeRedirectPath", () => {
  it("only allows same-site relative paths", () => {
    expect(safeRedirectPath("/account/orders")).toBe("/account/orders");
    expect(safeRedirectPath("https://evil.example")).toBe("/account");
    expect(safeRedirectPath("//evil.example")).toBe("/account");
    expect(safeRedirectPath("/\\evil.example")).toBe("/account");
    expect(safeRedirectPath("/login")).toBe("/account");
  });
});

describe("password policy", () => {
  it("rejects weak passwords", () => {
    expect(passwordProblem("short1")).toMatch(/at least/);
    expect(passwordProblem("password123")).toMatch(/too common/);
    expect(passwordProblem("onlyletterss")).toMatch(/Mix letters/);
    expect(passwordProblem("jane.doe-2026", { email: "jane.doe@example.com" })).toMatch(/email/);
    expect(passwordProblem("correct-horse-42")).toBeNull();
  });

  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("correct-horse-42");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-42")).toBe(true);
    expect(await verifyPassword(hash, "wrong-horse-42")).toBe(false);
    expect(await verifyPassword(null, "anything")).toBe(false);
  });
});

describe("signed values", () => {
  it("detects tampering", () => {
    const signed = signValue("cart-123");
    expect(unsignValue(signed)).toBe("cart-123");
    expect(unsignValue(signed.replace("cart-123", "cart-999"))).toBeNull();
    expect(unsignValue("no-signature")).toBeNull();
    expect(unsignValue(undefined)).toBeNull();
  });
});
