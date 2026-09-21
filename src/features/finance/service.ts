import "server-only";
import { loadSettings } from "@/features/settings/service";
import { db, type DbClient } from "@/server/db";
import { DEFAULT_COMMISSION, isCommissionBase, storedOrderFinance, type CommissionRule, type OrderFinance } from "./order-finance";

export * from "./order-finance";

/** The commission rule in force right now, as set in Admin → Settings. */
export async function currentCommissionRule(client: DbClient = db): Promise<CommissionRule> {
  const settings = await loadSettings(client);
  return { rateBps: settings.platform.commissionRateBps, base: settings.platform.commissionBase };
}

/** The rule an order was placed under. Stored on the order, so a later rate change cannot rewrite it. */
export function ruleOnOrder(order: { commissionRateBps: number; commissionBase: string }): CommissionRule {
  return { rateBps: order.commissionRateBps, base: isCommissionBase(order.commissionBase) ? order.commissionBase : DEFAULT_COMMISSION.base };
}

export const orderFinanceSelect = {
  subtotalCents: true,
  discountCents: true,
  shippingCents: true,
  taxCents: true,
  totalCents: true,
  fulfilmentCostCents: true,
  commissionRateBps: true,
  commissionBase: true,
  commissionCents: true,
  ownerEarningCents: true,
} as const;

/** The stored breakdown for one order. */
export async function getOrderFinance(orderId: string, client: DbClient = db): Promise<OrderFinance> {
  const order = await client.order.findUniqueOrThrow({ where: { id: orderId }, select: orderFinanceSelect });
  return storedOrderFinance(order);
}
