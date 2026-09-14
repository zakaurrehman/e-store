import { db } from "@/server/db";

const EUROPE = ["GB", "IE", "FR", "DE", "NL", "BE", "LU", "ES", "PT", "IT", "AT", "CH", "DK", "SE", "NO", "FI", "PL", "CZ", "GR"];

const ZONES = [
  {
    name: "United States",
    countries: ["US"],
    methods: [
      { name: "Standard", description: "Tracked, signature not required", priceCents: 695, freeOverCents: 15000, minDays: 3, maxDays: 5 },
      { name: "Express", description: "Priority handling, tracked", priceCents: 1495, freeOverCents: null, minDays: 1, maxDays: 2 },
    ],
  },
  {
    name: "Canada & Mexico",
    countries: ["CA", "MX"],
    methods: [
      { name: "Standard International", description: "Duties calculated at delivery", priceCents: 1495, freeOverCents: 25000, minDays: 5, maxDays: 9 },
      { name: "Express International", description: "Priority, tracked door to door", priceCents: 2900, freeOverCents: null, minDays: 2, maxDays: 4 },
    ],
  },
  {
    name: "Europe & United Kingdom",
    countries: EUROPE,
    methods: [
      { name: "Standard International", description: "Tracked; import duties may apply", priceCents: 1995, freeOverCents: 25000, minDays: 6, maxDays: 10 },
      { name: "Express International", description: "Priority, tracked door to door", priceCents: 3900, freeOverCents: null, minDays: 3, maxDays: 5 },
    ],
  },
  {
    name: "Rest of world",
    countries: ["*"],
    methods: [
      { name: "International Economy", description: "Tracked; import duties may apply", priceCents: 2995, freeOverCents: null, minDays: 10, maxDays: 20 },
      { name: "International Express", description: "Priority, tracked door to door", priceCents: 4900, freeOverCents: null, minDays: 4, maxDays: 8 },
    ],
  },
];

/** Prices are tax-exclusive. Rates are starting points — confirm with your tax adviser before launch. */
const TAX_RATES = [
  { name: "California sales tax", country: "US", region: "CA", rateBps: 725 },
  { name: "New York sales tax", country: "US", region: "NY", rateBps: 400 },
  { name: "Texas sales tax", country: "US", region: "TX", rateBps: 625 },
  { name: "Washington sales tax", country: "US", region: "WA", rateBps: 650 },
  { name: "Florida sales tax", country: "US", region: "FL", rateBps: 600 },
  { name: "Canada GST", country: "CA", region: null, rateBps: 500 },
  { name: "UK VAT", country: "GB", region: null, rateBps: 2000 },
  { name: "Germany VAT", country: "DE", region: null, rateBps: 1900 },
  { name: "France VAT", country: "FR", region: null, rateBps: 2000 },
];

export async function seedShippingAndTax() {
  if ((await db.shippingZone.count()) === 0) {
    for (const [index, zone] of ZONES.entries()) {
      await db.shippingZone.create({
        data: {
          name: zone.name,
          countries: zone.countries,
          position: index,
          methods: { create: zone.methods.map((method, position) => ({ ...method, position })) },
        },
      });
    }
    console.log(`✓ shipping: ${ZONES.length} zones`);
  }
  if ((await db.taxRate.count()) === 0) {
    await db.taxRate.createMany({ data: TAX_RATES });
    console.log(`✓ tax: ${TAX_RATES.length} rates`);
  }
}
