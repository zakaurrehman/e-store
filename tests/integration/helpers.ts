import { randomUUID } from "node:crypto";
import { seedAccessControl } from "../../db/seed/access-control";
import { seedSettings } from "../../db/seed/settings";
import { seedShippingAndTax } from "../../db/seed/shipping";
import { addItem, createGuestCart } from "@/features/cart/service";
import { saveProduct } from "@/features/catalog/service";
import type { PlaceOrderInput } from "@/features/checkout/schemas";
import { getShippingOptions } from "@/features/checkout/shipping";
import { ProductStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { SandboxProvider } from "@/server/payments/providers/sandbox";

export function assertTestDatabase() {
  const name = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/none").pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset "${name}": DATABASE_URL must point at a *_test database.`);
  }
}

/** Empties every application table, then restores roles, settings, shipping zones and tax rates. */
export async function resetDatabase() {
  assertTestDatabase();
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(({ tablename }) => `"${tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  await seedAccessControl();
  await seedSettings();
  await seedShippingAndTax();
}

const shortId = () => randomUUID().slice(0, 8);

export async function createProduct(options: { name?: string; priceCents?: number; salePriceCents?: number | null; stock?: number } = {}) {
  const product = await saveProduct({
    name: options.name ?? `Test product ${shortId()}`,
    status: ProductStatus.ACTIVE,
    variants: [
      {
        sku: `TEST-${shortId()}`,
        priceCents: options.priceCents ?? 5000,
        salePriceCents: options.salePriceCents ?? null,
        stockQuantity: options.stock ?? 10,
        trackInventory: true,
      },
    ],
  });
  const variant = await db.productVariant.findFirstOrThrow({ where: { productId: product.id } });
  return { product, variant };
}

export async function guestCartWith(items: Array<{ variantId: string; quantity: number }>) {
  const { cart } = await createGuestCart();
  for (const item of items) await addItem(cart.id, item.variantId, item.quantity);
  return cart;
}

export const US_ADDRESS = {
  firstName: "Test",
  lastName: "Buyer",
  company: null,
  line1: "1 Market Street",
  line2: null,
  city: "San Francisco",
  region: "CA",
  postalCode: "94105",
  country: "US",
  phone: null,
};

export async function orderInput(overrides: Partial<PlaceOrderInput> = {}): Promise<PlaceOrderInput> {
  const [method] = await getShippingOptions("US");
  if (!method) throw new Error("The shipping seed has no delivery method for the US.");
  return {
    idempotencyKey: randomUUID(),
    email: "buyer@example.com",
    phone: null,
    shippingAddress: US_ADDRESS,
    billingSameAsShipping: true,
    shippingMethodId: method.id,
    paymentProvider: "sandbox",
    customerNote: null,
    saveAddress: false,
    marketingOptIn: false,
    ...overrides,
  };
}

export const orderContext = (cartId: string, userId: string | null = null) => ({
  cartId,
  userId,
  ipAddress: "127.0.0.1",
  appUrl: process.env.APP_URL ?? "http://localhost:3100",
});

/** Signs webhooks exactly like the sandbox gateway does, using the test environment's secret. */
export const sandboxGateway = () => new SandboxProvider(process.env.SANDBOX_PAYMENTS_SECRET!, process.env.APP_URL!);
