import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ContactStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export const SUPPORT_PAGE_SIZE = 20;

export const SUPPORT_STATUS_LABELS: Record<ContactStatus, string> = { NEW: "New", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };
export const SUPPORT_STATUS_TONES: Record<ContactStatus, "warning" | "info" | "success"> = { NEW: "warning", IN_PROGRESS: "info", RESOLVED: "success" };

export const parseSupportStatus = (value: unknown): ContactStatus | undefined =>
  typeof value === "string" && value in ContactStatus ? (value as ContactStatus) : undefined;

/** The store's support inbox, newest first, with the counts behind the status filters. */
export async function listStoreMessages(storeId: string, options: { status?: ContactStatus; page?: number; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? SUPPORT_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const where: Prisma.ContactMessageWhereInput = { storeId, ...(options.status ? { status: options.status } : {}) };
  const [total, messages, counts] = await Promise.all([
    db.contactMessage.count({ where }),
    db.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, email: true, subject: true, status: true, createdAt: true, _count: { select: { replies: true } } },
    }),
    db.contactMessage.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    messages,
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<Record<ContactStatus, number>>,
    unanswered: counts.find((row) => row.status === ContactStatus.NEW)?._count._all ?? 0,
  };
}

/** One message with its reply history — only if it belongs to this store. */
export async function getStoreMessage(storeId: string, messageId: string) {
  return db.contactMessage.findFirst({
    where: { id: messageId, storeId },
    include: { replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { firstName: true, lastName: true } } } } },
  });
}
