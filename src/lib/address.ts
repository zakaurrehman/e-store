import { countryName } from "@/lib/countries";

/** Address snapshot stored on orders (JSON) and used by checkout, emails and invoices. */
export type AddressSnapshot = {
  firstName: string;
  lastName: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode: string;
  country: string;
  phone?: string | null;
};

export function formatAddressLines(address: AddressSnapshot): string[] {
  const cityLine = [address.city, address.region, address.postalCode].filter(Boolean).join(", ");
  return [
    `${address.firstName} ${address.lastName}`.trim(),
    address.company ?? "",
    address.line1,
    address.line2 ?? "",
    cityLine,
    countryName(address.country),
    address.phone ?? "",
  ].filter((line) => line && line.trim().length > 0);
}

export function isAddressSnapshot(value: unknown): value is AddressSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["firstName", "lastName", "line1", "city", "postalCode", "country"].every((key) => typeof record[key] === "string");
}
