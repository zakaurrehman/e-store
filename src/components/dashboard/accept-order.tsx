"use client";

import Link from "next/link";
import { ActionButton } from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { acceptMyOrderAction } from "@/features/stores/actions";
import { formatMoney } from "@/utils/money";

type Props = {
  order: { id: string; number: string; currency: string; fulfilmentCostCents: number };
  /** What accepting takes from the available balance: 0 when the customer's payment covers the cost. */
  neededCents: number;
  availableCents: number;
  /** The narrow version for a row in the orders list. */
  compact?: boolean;
};

/**
 * The owner's Accept for one order waiting for them. When the available balance cannot cover what the
 * order needs from it, Accept is shown disabled with the amount to add — and the server refuses in the same
 * way if the balance changes in between, so the button is never the only guard.
 */
export function AcceptOrder({ order, neededCents, availableCents, compact }: Props) {
  const money = (cents: number) => formatMoney(cents, order.currency);
  const shortCents = Math.max(0, neededCents - Math.max(0, availableCents));

  if (shortCents > 0) {
    return (
      <div className={compact ? "mt-1.5 space-y-1" : "flex flex-wrap items-center gap-3"}>
        <Button size={compact ? "xs" : "sm"} disabled title="Insufficient wallet balance to accept this order. Please add funds.">
          Accept
        </Button>
        <Link href="/dashboard/balance" className="block text-[0.75rem] font-medium text-warning underline underline-offset-4">
          Add {money(shortCents)} to accept
        </Link>
      </div>
    );
  }

  const source =
    neededCents > 0
      ? `${money(neededCents)} is set aside from your available balance now (you have ${money(availableCents)}), once.`
      : `The ${money(order.fulfilmentCostCents)} wholesale cost comes out of the customer's payment — nothing is taken from your balance.`;
  return (
    <div className={compact ? "mt-1.5" : undefined}>
      <ActionButton
        action={() => acceptMyOrderAction(order.id)}
        variant="primary"
        size={compact ? "xs" : "sm"}
        confirm={{
          title: `Accept order ${order.number}?`,
          description: (
            <>
              <span className="block">{source}</span>
              <span className="mt-2 block">Zendropship starts processing it straight away. What you earn on it stays held until it is delivered.</span>
            </>
          ),
          confirmLabel: "Accept order",
        }}
      >
        Accept
      </ActionButton>
    </div>
  );
}
