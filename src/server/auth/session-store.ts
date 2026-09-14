import { UserStatus } from "@/generated/prisma/enums";
import { db, type DbClient } from "@/server/db";
import { randomToken, sha256 } from "@/server/security/crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

export type AuthUser = {
  id: string;
  sessionId: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  mustResetPassword: boolean;
  role: { key: string; name: string; rank: number; isStaff: boolean };
  permissions: string[];
};

export async function createSessionRecord(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
  client: DbClient = db,
) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await client.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return { token, session };
}

/** Resolves a raw session token to an active user, or null. Expired sessions are removed. */
export async function resolveSessionToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: { select: { key: true } } } } } },
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const { user } = session;
  if (user.status !== UserStatus.ACTIVE || user.deletedAt) return null;

  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }

  return {
    id: user.id,
    sessionId: session.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: !!user.emailVerifiedAt,
    mustResetPassword: user.mustResetPassword,
    role: { key: user.role.key, name: user.role.name, rank: user.role.rank, isStaff: user.role.isStaff },
    permissions: user.role.permissions.map((entry) => entry.permission.key),
  };
}

export async function deleteSessionByToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function deleteUserSessions(userId: string, options: { exceptSessionId?: string } = {}, client: DbClient = db) {
  await client.session.deleteMany({
    where: { userId, ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}) },
  });
}
