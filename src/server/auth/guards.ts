import "server-only";
import { redirect } from "next/navigation";
import { hasPermission, type Permission } from "@/lib/permissions";
import { getCurrentUser, type AuthUser } from "@/server/auth/session";
import { PermissionError } from "@/server/errors";

/** Pages: redirect anonymous visitors to sign in and come back afterwards. */
export async function requireUser(returnTo = "/account"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/**
 * Admin pages: anonymous visitors sign in first. Someone signed in who is not staff is sent to their own
 * dashboard rather than a dead end — a 404 told a store owner who typed /admin nothing, and the sign-in
 * redirect already gives away that the path exists. No admin content renders either way.
 */
export async function requireStaff(returnTo = "/admin"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!user.role.isStaff) redirect("/dashboard");
  return user;
}

/** Admin pages that need a specific permission. */
export async function requirePagePermission(permission: Permission, returnTo = "/admin"): Promise<AuthUser> {
  const user = await requireStaff(returnTo);
  if (!hasPermission(user.permissions, permission)) redirect(`/admin/forbidden?permission=${permission}`);
  return user;
}

/** Server actions & route handlers: throws a PermissionError instead of redirecting. */
export async function assertPermission(permission: Permission): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user || !user.role.isStaff) throw new PermissionError("Please sign in with a staff account.");
  if (!hasPermission(user.permissions, permission)) throw new PermissionError();
  return user;
}

export async function assertSignedIn(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new PermissionError("Please sign in to continue.");
  return user;
}

export function can(user: Pick<AuthUser, "permissions"> | null | undefined, permission: Permission) {
  return !!user && hasPermission(user.permissions, permission);
}
