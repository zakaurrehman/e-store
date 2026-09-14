import { db, type DbClient } from "@/server/db";

export type ShippingOption = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  freeOverCents: number | null;
  minDays: number;
  maxDays: number;
};

/** Zone lookup: an explicit country match wins over the rest-of-world ("*") zone. */
export async function getShippingOptions(country: string, client: DbClient = db): Promise<ShippingOption[]> {
  const code = country.toUpperCase();
  const zones = await client.shippingZone.findMany({
    orderBy: { position: "asc" },
    include: { methods: { where: { isActive: true }, orderBy: { position: "asc" } } },
  });
  const zone = zones.find((candidate) => candidate.countries.includes(code)) ?? zones.find((candidate) => candidate.countries.includes("*"));
  if (!zone) return [];
  return zone.methods.map((method) => ({
    id: method.id,
    name: method.name,
    description: method.description,
    priceCents: method.priceCents,
    freeOverCents: method.freeOverCents,
    minDays: method.minDays,
    maxDays: method.maxDays,
  }));
}

export async function getShippableCountries(client: DbClient = db) {
  const zones = await client.shippingZone.findMany({ select: { countries: true, methods: { where: { isActive: true }, select: { id: true } } } });
  const active = zones.filter((zone) => zone.methods.length > 0);
  if (active.some((zone) => zone.countries.includes("*"))) return "*" as const;
  return [...new Set(active.flatMap((zone) => zone.countries))];
}

/** Region-specific rate first (e.g. US-CA), then the country-wide rate. */
export async function getTaxRate(country: string, region: string | null | undefined, client: DbClient = db) {
  const code = country.toUpperCase();
  const rates = await client.taxRate.findMany({ where: { country: code, isActive: true } });
  const regionCode = region?.trim().toUpperCase();
  return rates.find((rate) => regionCode && rate.region?.toUpperCase() === regionCode) ?? rates.find((rate) => rate.region === null) ?? null;
}

export function deliveryEstimate(option: Pick<ShippingOption, "minDays" | "maxDays">) {
  return option.minDays === option.maxDays ? `${option.minDays} business day${option.minDays === 1 ? "" : "s"}` : `${option.minDays}–${option.maxDays} business days`;
}
