import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  createSessionRecord,
  deleteSessionByToken,
  resolveSessionToken,
  SESSION_TTL_MS,
  type AuthUser,
} from "@/server/auth/session-store";
import type { RequestMeta } from "@/server/request";

const isProduction = process.env.NODE_ENV === "production";

/** `__Host-` prefix pins the cookie to this exact host over HTTPS (not usable on http://localhost). */
export const SESSION_COOKIE = isProduction ? "__Host-zendropship_session" : "zendropship_session";

export async function startSession(userId: string, meta: RequestMeta) {
  const { token, session } = await createSessionRecord(userId, meta);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
  return session;
}

/** The signed-in user for this request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const jar = await cookies();
  return resolveSessionToken(jar.get(SESSION_COOKIE)?.value);
});

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByToken(token);
  jar.delete(SESSION_COOKIE);
}

export type { AuthUser };
