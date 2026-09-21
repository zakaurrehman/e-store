import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { normaliseReferralCode, referralCodeState, type ReferralCodeState } from "./codes";

export const REFERRAL_PAGE_SIZE = 25;

export const parseReferralState = (value: unknown): ReferralCodeState | undefined =>
  value === "ACTIVE" || value === "USED" || value === "EXPIRED" || value === "DISABLED" ? value : undefined;

/** Every code with who used it and the store it opened — the admin list. */
export async function listReferralCodes(options: { page?: number; q?: string; state?: ReferralCodeState } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim().slice(0, 40);
  const normalised = q ? normaliseReferralCode(q) : "";
  const where: Prisma.ReferralCodeWhereInput = q
    ? { OR: [{ code: { contains: normalised.replace("ZD-", ""), mode: "insensitive" } }, { label: { contains: q, mode: "insensitive" } }, { redemptions: { some: { user: { email: { contains: q, mode: "insensitive" } } } } }] }
    : {};

  const [total, rows, counts] = await Promise.all([
    db.referralCode.count({ where }),
    db.referralCode.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REFERRAL_PAGE_SIZE,
      take: REFERRAL_PAGE_SIZE,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        redemptions: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, store: { select: { slug: true, name: true } } },
        },
      },
    }),
    db.referralCode.findMany({ select: { isActive: true, expiresAt: true, maxUses: true, usedCount: true } }),
  ]);

  const tally = { ACTIVE: 0, USED: 0, EXPIRED: 0, DISABLED: 0 } satisfies Record<ReferralCodeState, number>;
  for (const row of counts) tally[referralCodeState(row)] += 1;

  const codes = rows.map((row) => ({ ...row, state: referralCodeState(row) }));
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / REFERRAL_PAGE_SIZE)),
    codes: options.state ? codes.filter((code) => code.state === options.state) : codes,
    tally,
  };
}

/** The invitation an owner opened their store with — shown on the admin store page. */
export async function getStoreReferral(storeId: string) {
  return db.referralRedemption.findFirst({ where: { storeId }, include: { code: { select: { code: true, label: true } } } });
}
