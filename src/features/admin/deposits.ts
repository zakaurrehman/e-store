import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DepositStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export const DEPOSITS_PAGE_SIZE = 20;

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = { PENDING: "Pending", CONFIRMED: "Approved", REJECTED: "Rejected" };
export const DEPOSIT_STATUS_TONES: Record<DepositStatus, "warning" | "success" | "danger"> = { PENDING: "warning", CONFIRMED: "success", REJECTED: "danger" };

export const parseDepositStatus = (value: unknown): DepositStatus | undefined =>
  typeof value === "string" && value in DepositStatus ? (value as DepositStatus) : undefined;

const depositInclude = {
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } },
    },
  },
  // Whoever filled the form — normally the owner, but staff can record one on their behalf.
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  confirmedBy: { select: { id: true, firstName: true, lastName: true } },
  proof: { select: { id: true, url: true, width: true, height: true, filename: true, mimeType: true, sizeBytes: true } },
  // What actually went onto the ledger, so the screen can show the credit rather than assume it.
  entries: { where: { type: WalletEntryType.DEPOSIT }, select: { id: true, amountCents: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.DepositInclude;

export type AdminDeposit = Prisma.DepositGetPayload<{ include: typeof depositInclude }>;

/**
 * Every deposit an owner has declared, newest first, with the owner behind it, the proof they uploaded
 * and — once approved — the ledger entry that credited them.
 */
export async function listDepositsForAdmin(filters: { status?: DepositStatus; q?: string; page?: number } = {}) {
  const where: Prisma.DepositWhereInput = {};
  if (filters.status) where.status = filters.status;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
      { store: { name: { contains: q, mode: "insensitive" } } },
      { store: { slug: { contains: q.toLowerCase() } } },
      { store: { owner: { email: { contains: q, mode: "insensitive" } } } },
      { store: { owner: { firstName: { contains: q, mode: "insensitive" } } } },
      { store: { owner: { lastName: { contains: q, mode: "insensitive" } } } },
    ];
  }
  const page = Math.max(1, filters.page ?? 1);
  const [total, deposits, counts] = await Promise.all([
    db.deposit.count({ where }),
    db.deposit.findMany({
      where,
      // Anything waiting for a decision comes first, then the most recent.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * DEPOSITS_PAGE_SIZE,
      take: DEPOSITS_PAGE_SIZE,
      include: depositInclude,
    }),
    db.deposit.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountCents: true } }),
  ]);

  const byStatus = Object.fromEntries(counts.map((row) => [row.status, { count: row._count._all, cents: row._sum.amountCents ?? 0 }])) as Partial<
    Record<DepositStatus, { count: number; cents: number }>
  >;

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / DEPOSITS_PAGE_SIZE)),
    deposits,
    counts: {
      pending: byStatus.PENDING ?? { count: 0, cents: 0 },
      approved: byStatus.CONFIRMED ?? { count: 0, cents: 0 },
      rejected: byStatus.REJECTED ?? { count: 0, cents: 0 },
    },
  };
}
