import { describe, expect, it } from "vitest";
import { cleanEnvValue, envFlag, envOption, paymentProviderList } from "@/lib/env-value";

describe("environment value normalisation", () => {
  it("removes surrounding whitespace, Windows line endings and one pair of matching quotes", () => {
    expect(cleanEnvValue("  blob\r")).toBe("blob");
    expect(cleanEnvValue('"postgres"')).toBe("postgres");
    expect(cleanEnvValue("'memory'")).toBe("memory");
    expect(cleanEnvValue('"mismatched\'')).toBe('"mismatched\'');
  });

  it("treats empty, whitespace-only and missing values as unset", () => {
    expect(cleanEnvValue("")).toBeUndefined();
    expect(cleanEnvValue("   ")).toBeUndefined();
    expect(cleanEnvValue('""')).toBeUndefined();
    expect(cleanEnvValue(undefined)).toBeUndefined();
  });

  it("lower-cases options and reads boolean flags", () => {
    expect(envOption(" Blob ")).toBe("blob");
    expect(envFlag("TRUE")).toBe(true);
    expect(envFlag("1")).toBe(true);
    expect(envFlag("false")).toBe(false);
    expect(envFlag(undefined)).toBe(false);
  });

  it("defaults payment providers to cash on delivery in production and adds the sandbox elsewhere", () => {
    expect(paymentProviderList(undefined, "production")).toEqual(["cod"]);
    expect(paymentProviderList("", "production")).toEqual(["cod"]);
    expect(paymentProviderList(undefined, "development")).toEqual(["sandbox", "cod"]);
    expect(paymentProviderList(" Stripe, COD ", "production")).toEqual(["stripe", "cod"]);
  });
});
