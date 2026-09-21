/**
 * The one place an order's money is worked out. Client-safe: pure functions only.
 *
 * Every screen (customer order, owner dashboard, admin order, wallet ledger, analytics) reads these
 * numbers rather than recalculating them, and every order stores the result so that a later change to
 * the commission rate can never rewrite history.
 *
 * The rule, in words:
 *
 *   Customer paid      = goods + shipping + tax, less any discount        (order.totalCents)
 *   Goods sold         = subtotal − discount                              (the owner's revenue)
 *   Fulfilment cost    = wholesale cost of those goods, charged to the owner when fulfilment accepts
 *   Commission         = the configured rate applied to the configured base, rounded to the cent
 *   Owner earning      = goods sold − fulfilment cost − commission
 *
 * Shipping and tax are collected by Zendropship and spent on shipping and tax; they are not part of
 * the owner's revenue and never attract commission.
 */

export type CommissionBase = "ORDER_REVENUE" | "OWNER_MARGIN";

export type CommissionRule = { rateBps: number; base: CommissionBase };

export const DEFAULT_COMMISSION: CommissionRule = { rateBps: 1000, base: "ORDER_REVENUE" };

export const COMMISSION_BASE_LABELS: Record<CommissionBase, string> = {
  ORDER_REVENUE: "Goods sold (after discount)",
  OWNER_MARGIN: "Owner's margin (goods sold − wholesale)",
};

export function isCommissionBase(value: unknown): value is CommissionBase {
  return value === "ORDER_REVENUE" || value === "OWNER_MARGIN";
}

/** An order as the finance rules see it: the money on the order plus the wholesale cost of its lines. */
export type FinanceableOrder = {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  items: Array<{ unitCostCents: number; quantity: number }>;
};

export type OrderFinance = {
  /** What the customer paid in total, shipping and tax included. */
  customerPaidCents: number;
  /** The goods the customer paid for, after discount — the owner's revenue. */
  revenueCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  /** Wholesale cost of the goods, charged to the owner's balance. */
  fulfilmentCostCents: number;
  /** Revenue less wholesale, before commission. */
  marginCents: number;
  commissionRateBps: number;
  commissionBase: CommissionBase;
  commissionCents: number;
  /** What the owner keeps: revenue − wholesale − commission. */
  ownerEarningCents: number;
};

export const wholesaleTotalCents = (items: Array<{ unitCostCents: number; quantity: number }>) =>
  items.reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0);

/** Commission on an order. Never negative: a loss-making sale owes no commission on a negative margin. */
export function commissionCentsFor(rule: CommissionRule, amounts: { revenueCents: number; marginCents: number }) {
  const base = rule.base === "OWNER_MARGIN" ? amounts.marginCents : amounts.revenueCents;
  if (base <= 0 || rule.rateBps <= 0) return 0;
  return Math.round((base * rule.rateBps) / 10_000);
}

/**
 * Works out every figure for an order. `rule` is the commission in force — for an order that already
 * exists, pass the rule stored on the order so the numbers never move.
 */
export function calculateOrderFinance(order: FinanceableOrder, rule: CommissionRule): OrderFinance {
  const revenueCents = Math.max(0, order.subtotalCents - order.discountCents);
  const fulfilmentCostCents = wholesaleTotalCents(order.items);
  const marginCents = revenueCents - fulfilmentCostCents;
  const commissionCents = commissionCentsFor(rule, { revenueCents, marginCents });
  return {
    customerPaidCents: order.totalCents,
    revenueCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    fulfilmentCostCents,
    marginCents,
    commissionRateBps: rule.rateBps,
    commissionBase: rule.base,
    commissionCents,
    ownerEarningCents: marginCents - commissionCents,
  };
}

/** An order that has already been placed carries its own snapshot; read it rather than recalculating. */
export type StoredOrderFinance = {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  fulfilmentCostCents: number;
  commissionRateBps: number;
  commissionBase: string;
  commissionCents: number;
  ownerEarningCents: number;
};

export function storedOrderFinance(order: StoredOrderFinance): OrderFinance {
  const revenueCents = Math.max(0, order.subtotalCents - order.discountCents);
  return {
    customerPaidCents: order.totalCents,
    revenueCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    fulfilmentCostCents: order.fulfilmentCostCents,
    marginCents: revenueCents - order.fulfilmentCostCents,
    commissionRateBps: order.commissionRateBps,
    commissionBase: isCommissionBase(order.commissionBase) ? order.commissionBase : "ORDER_REVENUE",
    commissionCents: order.commissionCents,
    ownerEarningCents: order.ownerEarningCents,
  };
}

/** The rule as the settings store it. */
export const commissionRuleOf = (platform: { commissionRateBps: number; commissionBase: CommissionBase }): CommissionRule => ({ rateBps: platform.commissionRateBps, base: platform.commissionBase });

/**
 * What an owner keeps on one unit sold at `retailCents`: the same arithmetic as a whole order, so the
 * catalogue, the pricing screens and the order breakdown can never disagree.
 */
export function unitEarning(retailCents: number, costCents: number, rule: CommissionRule) {
  const marginCents = retailCents - costCents;
  const commissionCents = commissionCentsFor(rule, { revenueCents: retailCents, marginCents });
  const earningCents = marginCents - commissionCents;
  return { marginCents, commissionCents, earningCents, percent: retailCents > 0 ? Math.round((earningCents / retailCents) * 100) : 0 };
}

export const formatRate = (rateBps: number) => `${(rateBps / 100).toFixed(rateBps % 100 === 0 ? 0 : 2)}%`;

/** Share of a component that a (possibly partial) refund gives back. */
export function refundShareCents(componentCents: number, refundedCents: number, orderTotalCents: number) {
  if (componentCents === 0 || refundedCents <= 0 || orderTotalCents <= 0) return 0;
  if (refundedCents >= orderTotalCents) return componentCents;
  return Math.round((componentCents * refundedCents) / orderTotalCents);
}
