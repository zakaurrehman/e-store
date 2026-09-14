import { TokenType, UserStatus } from "@/generated/prisma/enums";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { deleteUserSessions } from "@/server/auth/session-store";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { randomToken, sha256 } from "@/server/security/crypto";

export const EMAIL_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 10;
export const LOCKOUT_MS = 15 * 60 * 1000;

export class AuthError extends DomainError {}

const invalidCredentials = () => new AuthError("INVALID_CREDENTIALS", "That email and password combination didn't work.");

export async function createToken(userId: string, type: TokenType) {
  const token = randomToken(32);
  const ttl = type === TokenType.PASSWORD_RESET ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFICATION_TTL_MS;
  await db.$transaction([
    // Only the most recent token of a type is valid.
    db.verificationToken.deleteMany({ where: { userId, type, usedAt: null } }),
    db.verificationToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl) },
    }),
  ]);
  return token;
}

async function consumeToken(token: string, type: TokenType) {
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt) {
    throw new AuthError("TOKEN_INVALID", "This link is invalid or has already been used.");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new AuthError("TOKEN_EXPIRED", "This link has expired. Please request a new one.");
  }
  const claimed = await db.verificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) throw new AuthError("TOKEN_INVALID", "This link has already been used.");
  return record;
}

export type RegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  marketingOptIn?: boolean;
};

export async function registerCustomer(input: RegisterInput, meta: { ipAddress?: string } = {}) {
  const problem = passwordProblem(input.password, { email: input.email });
  if (problem) throw new AuthError("PASSWORD_WEAK", problem, { fieldErrors: { password: [problem] } });

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw new AuthError("EMAIL_TAKEN", "An account with this email already exists. Sign in or reset your password.", {
      fieldErrors: { email: ["An account with this email already exists."] },
    });
  }

  const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      marketingOptIn: input.marketingOptIn ?? false,
      roleId: role.id,
    },
  });
  if (input.marketingOptIn) {
    await db.newsletterSubscriber.upsert({
      where: { email: input.email },
      create: { email: input.email, source: "registration" },
      update: { unsubscribedAt: null },
    });
  }
  const verificationToken = await createToken(user.id, TokenType.EMAIL_VERIFICATION);
  await writeAudit({ actorId: user.id, action: "user.register", entityType: "User", entityId: user.id, summary: "Customer registered", ipAddress: meta.ipAddress });
  return { user, verificationToken };
}

export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email }, include: { role: true } });
  if (!user || user.deletedAt) {
    await verifyPassword(null, password);
    throw invalidCredentials();
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AuthError("ACCOUNT_LOCKED", "Too many failed attempts. Your account is temporarily locked — try again in 15 minutes or reset your password.");
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
      },
    });
    throw invalidCredentials();
  }

  if (user.status === UserStatus.DISABLED) {
    throw new AuthError("ACCOUNT_DISABLED", "This account has been disabled. Please contact customer care.");
  }
  if (user.mustResetPassword) {
    throw new AuthError("PASSWORD_RESET_REQUIRED", "For your security, please set a new password. Use “Forgot password” to receive a reset link.");
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return user;
}

export async function verifyEmailToken(token: string) {
  const record = await consumeToken(token, TokenType.EMAIL_VERIFICATION);
  return db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
}

/** Always resolves (never reveals whether the account exists). Returns the token for the notifier when applicable. */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || user.status === UserStatus.DISABLED) return null;
  const token = await createToken(user.id, TokenType.PASSWORD_RESET);
  return { user, token };
}

export async function resetPasswordWithToken(token: string, password: string) {
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  const problem = passwordProblem(password, { email: record?.user.email });
  if (problem) throw new AuthError("PASSWORD_WEAK", problem, { fieldErrors: { password: [problem] } });

  const consumed = await consumeToken(token, TokenType.PASSWORD_RESET);
  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: consumed.userId },
      data: {
        passwordHash,
        mustResetPassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        // Completing a reset proves control of the mailbox.
        emailVerifiedAt: record?.user.emailVerifiedAt ?? new Date(),
      },
    });
    await deleteUserSessions(consumed.userId, {}, tx);
    return updated;
  });
  await writeAudit({ actorId: user.id, action: "user.password_reset", entityType: "User", entityId: user.id, summary: "Password reset via email link" });
  return user;
}

export async function changePassword(userId: string, sessionId: string, currentPassword: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AuthError("INVALID_CREDENTIALS", "Your current password is incorrect.", {
      fieldErrors: { currentPassword: ["Your current password is incorrect."] },
    });
  }
  const problem = passwordProblem(password, { email: user.email });
  if (problem) throw new AuthError("PASSWORD_WEAK", problem, { fieldErrors: { password: [problem] } });
  if (await verifyPassword(user.passwordHash, password)) {
    throw new AuthError("PASSWORD_REUSED", "Choose a password different from your current one.", {
      fieldErrors: { password: ["Choose a password different from your current one."] },
    });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await deleteUserSessions(userId, { exceptSessionId: sessionId });
  await writeAudit({ actorId: userId, action: "user.password_change", entityType: "User", entityId: userId, summary: "Password changed; other sessions signed out" });
}
