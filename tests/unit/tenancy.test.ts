import { describe, expect, it } from "vitest";
import { classifyHost, isValidStoreSlug, slugFromStoreName, storeBaseDomain, storeUrl } from "@/lib/tenancy";

describe("store base domain", () => {
  it("prefers STORE_DOMAIN, then APP_URL without www, then the Vercel production domain, then localhost", () => {
    expect(storeBaseDomain({ STORE_DOMAIN: "Shops.Example.com" })).toBe("shops.example.com");
    expect(storeBaseDomain({ APP_URL: "https://www.zendropship.io" })).toBe("zendropship.io");
    expect(storeBaseDomain({ APP_URL: "https://e-store-three-nu.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "www.zendropship.io" })).toBe("zendropship.io");
    expect(storeBaseDomain({ APP_URL: "http://localhost:3456" })).toBe("localhost");
    expect(storeBaseDomain({})).toBe("localhost");
  });
});

describe("host classification", () => {
  const base = "zendropship.io";
  it("recognises the platform hosts", () => {
    expect(classifyHost("www.zendropship.io", base)).toEqual({ kind: "platform" });
    expect(classifyHost("zendropship.io", base)).toEqual({ kind: "platform" });
    expect(classifyHost("e-store-three-nu.vercel.app", base)).toEqual({ kind: "platform" });
    expect(classifyHost("localhost:3456", "localhost")).toEqual({ kind: "platform" });
  });

  it("maps a subdomain to its store, ignoring ports and case", () => {
    expect(classifyHost("Maya.zendropship.io:443", base)).toEqual({ kind: "store", slug: "maya" });
    expect(classifyHost("demo.localhost:3456", "localhost")).toEqual({ kind: "store", slug: "demo" });
  });

  it("rejects reserved, nested and malformed subdomains", () => {
    expect(classifyHost("admin.zendropship.io", base).kind).toBe("unknown");
    expect(classifyHost("a.b.zendropship.io", base).kind).toBe("unknown");
    expect(classifyHost("-bad.zendropship.io", base).kind).toBe("unknown");
    expect(classifyHost("evil.example.com", base).kind).toBe("unknown");
    expect(classifyHost("", base).kind).toBe("unknown");
  });
});

describe("store slugs", () => {
  it("accepts 3–30 character lower-case slugs and refuses reserved names", () => {
    expect(isValidStoreSlug("maya")).toBe(true);
    expect(isValidStoreSlug("my-store-2")).toBe(true);
    expect(isValidStoreSlug("ab")).toBe(false);
    expect(isValidStoreSlug("Maya")).toBe(false);
    expect(isValidStoreSlug("my--store")).toBe(false);
    expect(isValidStoreSlug("www")).toBe(false);
    expect(isValidStoreSlug("dashboard")).toBe(false);
  });

  it("derives a slug from a store name", () => {
    expect(slugFromStoreName("Maya's Closet!")).toBe("mayas-closet");
    expect(slugFromStoreName("  Élan   Studio ")).toBe("elan-studio");
  });

  it("builds store URLs for production and development", () => {
    expect(storeUrl("maya", { APP_URL: "https://www.zendropship.io" })).toBe("https://maya.zendropship.io");
    expect(storeUrl("demo", { APP_URL: "http://localhost:3456" })).toBe("http://demo.localhost:3456");
  });
});
