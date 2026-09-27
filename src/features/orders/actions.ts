"use server";

import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { readTrackingStamp } from "./queries";

const pulseSchema = z.object({ number: z.string().min(5).max(20), token: z.string().max(200).optional() });

/**
 * The tracking page's heartbeat: the order's current fingerprint, for the customer who placed it (signed in,
 * or with the order's access token), so the page re-renders when the order has moved on. Anyone else gets
 * null, the same as for an order that does not exist.
 */
export async function orderPulseAction(input: { number: string; token?: string }): Promise<{ stamp: string | null }> {
  const parsed = pulseSchema.safeParse(input);
  if (!parsed.success) return { stamp: null };
  const user = await getCurrentUser();
  return { stamp: await readTrackingStamp(parsed.data.number, { userId: user?.id ?? null, token: parsed.data.token ?? null }) };
}
