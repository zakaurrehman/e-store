import { ProductStatus } from "@/generated/prisma/enums";
import type { PricingLine } from "@/features/checkout/pricing";
import { storePriceFor, type StorePricingRules } from "@/features/stores/pricing";
import { db, type DbClient } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { randomToken, sha256 } from "@/server/security/crypto";

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 50;
export const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

import type { CartLine } from "./types";

export type { CartLine };

export type CartView = {
  id: string;
  storeId: string;
  currency: string;
  couponCode: string | null;
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  hasUnavailableItems: boolean;
};

/** A cart line with everything needed to price it for the cart's store. */
const lineInclude = (storeId: string) =>
  ({
    variant: {
      include: {
        image: { select: { url: true, alt: true } },
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            deletedAt: true,
            brand: { select: { name: true } },
            categories: { select: { categoryId: true } },
            images: { orderBy: { position: "asc" as const }, take: 1, select: { alt: true, media: { select: { url: true, alt: true } } } },
            storeProducts: { where: { storeId }, select: { isActive: true, markupBps: true, fixedPriceCents: true } },
          },
        },
      },
    },
  }) as const;

function purchasableLimit(variant: { trackInventory: boolean; allowBackorder: boolean; stockQuantity: number }) {
  if (!variant.trackInventory || variant.allowBackorder) return MAX_LINE_QUANTITY;
  return Math.max(0, Math.min(MAX_LINE_QUANTITY, variant.stockQuantity));
}

export async function loadCart(cartId: string, client: DbClient = db): Promise<CartView | null> {
  const head = await client.cart.findUnique({ where: { id: cartId }, select: { storeId: true } });
  if (!head) return null;
  const cart = await client.cart.findUnique({
    where: { id: cartId },
    include: { store: { select: { pricingMode: true, markupBps: true, currency: true } }, items: { orderBy: { createdAt: "asc" }, include: lineInclude(head.storeId) } },
  });
  if (!cart) return null;
  const rules: StorePricingRules = { mode: cart.store.pricingMode, markupBps: cart.store.markupBps };

  const lines: CartLine[] = cart.items.map((item) => {
    const { variant } = item;
    const { product } = variant;
    const listing = product.storeProducts[0] ?? null;
    const sellable = product.status === ProductStatus.ACTIVE && !product.deletedAt && variant.isActive && !!listing?.isActive;
    const limit = sellable ? purchasableLimit(variant) : 0;
    const priced = storePriceFor(variant, rules, listing);
    const unitPriceCents = priced.priceCents;
    const image = variant.image ?? product.images[0]?.media ?? null;
    return {
      id: item.id,
      variantId: variant.id,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      brandName: product.brand?.name ?? null,
      variantTitle: variant.title === "Default" ? null : variant.title,
      sku: variant.sku,
      imageUrl: image?.url ?? null,
      imageAlt: product.images[0]?.alt || image?.alt || product.name,
      unitPriceCents,
      unitCostCents: priced.costCents,
      compareAtCents: priced.compareAtCents,
      quantity: item.quantity,
      lineTotalCents: unitPriceCents * item.quantity,
      maxQuantity: variant.trackInventory && !variant.allowBackorder ? limit : null,
      available: sellable && limit >= item.quantity && limit > 0,
      categoryIds: product.categories.map((entry) => entry.categoryId),
      weightGrams: variant.weightGrams ?? 0,
    };
  });

  return {
    id: cart.id,
    storeId: cart.storeId,
    currency: cart.store.currency,
    couponCode: cart.couponCode,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents: lines.filter((line) => line.available).reduce((sum, line) => sum + line.lineTotalCents, 0),
    hasUnavailableItems: lines.some((line) => !line.available),
  };
}

export function toPricingLines(cart: CartView): PricingLine[] {
  return cart.lines
    .filter((line) => line.available)
    .map((line) => ({ key: line.variantId, productId: line.productId, categoryIds: line.categoryIds, unitPriceCents: line.unitPriceCents, quantity: line.quantity }));
}

/** A variant the given store currently sells. */
async function sellableVariant(variantId: string, storeId: string, client: DbClient) {
  const variant = await client.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { name: true, status: true, deletedAt: true, storeProducts: { where: { storeId, isActive: true }, select: { id: true } } } } },
  });
  if (!variant || !variant.isActive || variant.product.status !== ProductStatus.ACTIVE || variant.product.deletedAt || variant.product.storeProducts.length === 0) {
    throw new NotFoundError("This item is no longer available.");
  }
  return variant;
}

function stockError(limit: number, name: string) {
  return limit === 0
    ? new DomainError("OUT_OF_STOCK", `${name} is sold out.`)
    : new DomainError("INSUFFICIENT_STOCK", `Only ${limit} of ${name} ${limit === 1 ? "is" : "are"} available.`);
}

export async function createGuestCart(storeId: string) {
  const token = randomToken(32);
  const cart = await db.cart.create({ data: { storeId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + GUEST_CART_TTL_MS) } });
  return { cart, token };
}

/** The guest cart behind a cookie token, provided it belongs to this store (cookies are per host, but never trust them alone). */
export async function findGuestCart(token: string | undefined | null, storeId: string) {
  if (!token || token.length > 200) return null;
  const cart = await db.cart.findUnique({ where: { tokenHash: sha256(token) } });
  return cart && cart.storeId === storeId ? cart : null;
}

/** Customers have one cart per store. */
export async function getOrCreateUserCart(userId: string, storeId: string) {
  return db.cart.upsert({ where: { userId_storeId: { userId, storeId } }, create: { userId, storeId }, update: {} });
}

export async function addItem(cartId: string, variantId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new DomainError("INVALID_QUANTITY", "Choose a quantity of at least 1.");
  return db.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { id: cartId }, select: { storeId: true } });
    if (!cart) throw new NotFoundError("Your bag could not be found.");
    const variant = await sellableVariant(variantId, cart.storeId, tx);
    const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
    if (!existing && (await tx.cartItem.count({ where: { cartId } })) >= MAX_CART_LINES) {
      throw new DomainError("CART_FULL", "Your bag is full. Remove an item to add something new.");
    }
    const limit = purchasableLimit(variant);
    const desired = (existing?.quantity ?? 0) + quantity;
    if (desired > limit) {
      if (limit === 0) throw stockError(0, variant.product.name);
      if (limit === MAX_LINE_QUANTITY) throw new DomainError("MAX_QUANTITY", `You can add up to ${MAX_LINE_QUANTITY} of each item.`);
      throw stockError(limit, variant.product.name);
    }
    await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity: desired },
      update: { quantity: desired },
    });
    await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    return { name: variant.product.name, quantity: desired };
  });
}

export async function setItemQuantity(cartId: string, itemId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new DomainError("INVALID_QUANTITY", "Enter a valid quantity.");
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId }, include: { variant: { include: { product: { select: { name: true, status: true, deletedAt: true } } } } } });
  if (!item) throw new NotFoundError("That item is no longer in your bag.");
  if (quantity === 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return;
  }
  const limit = purchasableLimit(item.variant);
  if (quantity > limit) {
    if (limit === MAX_LINE_QUANTITY) throw new DomainError("MAX_QUANTITY", `You can add up to ${MAX_LINE_QUANTITY} of each item.`);
    throw stockError(limit, item.variant.product.name);
  }
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
}

export async function removeItem(cartId: string, itemId: string) {
  await db.cartItem.deleteMany({ where: { id: itemId, cartId } });
}

export async function setCartCoupon(cartId: string, code: string | null) {
  await db.cart.update({ where: { id: cartId }, data: { couponCode: code } });
}

/**
 * Moves a guest cart into the customer's cart at sign-in. Quantities are summed and clamped to stock;
 * the guest cart is deleted. Returns the customer's cart id.
 */
export async function mergeGuestCartIntoUser(guestCartId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const guest = await tx.cart.findUnique({ where: { id: guestCartId }, include: { items: { include: { variant: true } } } });
    if (!guest) return null;
    const userCart = await tx.cart.upsert({ where: { userId_storeId: { userId, storeId: guest.storeId } }, create: { userId, storeId: guest.storeId }, update: {} });
    if (guest.id === userCart.id) return userCart.id;

    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } } });
      const limit = purchasableLimit(item.variant);
      const quantity = Math.min(limit || item.quantity, (existing?.quantity ?? 0) + item.quantity);
      if (quantity <= 0) continue;
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
        create: { cartId: userCart.id, variantId: item.variantId, quantity },
        update: { quantity },
      });
    }
    if (guest.couponCode && !userCart.couponCode) {
      await tx.cart.update({ where: { id: userCart.id }, data: { couponCode: guest.couponCode } });
    }
    await tx.cart.delete({ where: { id: guest.id } });
    return userCart.id;
  });
}

export async function clearCart(cartId: string, client: DbClient = db) {
  await client.cartItem.deleteMany({ where: { cartId } });
  await client.cart.update({ where: { id: cartId }, data: { couponCode: null } });
}
