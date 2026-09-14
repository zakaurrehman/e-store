import type { Prisma } from "@/generated/prisma/client";
import { db, type DbClient } from "@/server/db";

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

/** Appends to the audit log. Failures are logged but never break the business operation. */
export async function writeAudit(entry: AuditEntry, client: DbClient = db) {
  try {
    await client.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary.slice(0, 500),
        changes: entry.changes,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write entry", entry.action, error);
  }
}

/** Shallow diff of two plain objects, used to record what changed in an update. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    const same =
      from instanceof Date && to instanceof Date
        ? from.getTime() === to.getTime()
        : JSON.stringify(from) === JSON.stringify(to);
    if (!same) changes[key] = { from, to };
  }
  return changes;
}
