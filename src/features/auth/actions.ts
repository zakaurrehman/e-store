"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { TokenType } from "@/generated/prisma/enums";
import { mergeGuestCartAfterLogin } from "@/features/cart/session";
import { getCurrentStore } from "@/features/stores/current";
import { dispatchNotification, sendDeliveries, type NotificationEvent } from "@/server/notifications";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { endSession, getCurrentUser, startSession } from "@/server/auth/session";
import { getRequestMeta } from "@/server/request";
import { rateLimit, resetRateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, safeRedirectPath } from "./schemas";
import { authenticate, changePassword, createToken, registerCustomer, requestPasswordReset, resetPasswordWithToken } from "./service";

function notifyAfterResponse(event: NotificationEvent) {
  after(async () => {
    try {
      await sendDeliveries(await dispatchNotification(event));
    } catch (error) {
      console.error(`[auth] notification ${event.type} failed`, error);
    }
  });
}

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return zodFailure(parsed.error);
  const meta = await getRequestMeta();
  const [byIp, byAccount] = await Promise.all([rateLimit("login", `ip:${meta.ipAddress}`, { limit: 30, windowMs: 15 * 60_000 }), rateLimit("login", `email:${parsed.data.email}`)]);
  if (!byIp.success || !byAccount.success) return failure(retryAfterMessage(byIp.success ? byAccount.resetAt : byIp.resetAt));

  let destination: string;
  try {
    const user = await authenticate(parsed.data.email, parsed.data.password);
    await startSession(user.id, meta);
    const store = await getCurrentStore();
    if (store) await mergeGuestCartAfterLogin(user.id, store.id);
    await resetRateLimit("login", `email:${parsed.data.email}`);
    await writeAudit({ actorId: user.id, action: "user.login", entityType: "User", entityId: user.id, summary: "Signed in", ipAddress: meta.ipAddress });
    // On a store the customer lands in their account there; on the platform site staff go to the admin, owners to their dashboard.
    destination = safeRedirectPath(parsed.data.next, store ? "/account" : user.role.isStaff ? "/admin" : "/dashboard");
  } catch (error) {
    return handleActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

export async function registerAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    marketingOptIn: formData.get("marketingOptIn") ?? undefined,
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  const meta = await getRequestMeta();
  const limit = await rateLimit("register", meta.ipAddress);
  if (!limit.success) return failure(retryAfterMessage(limit.resetAt));

  let destination: string;
  try {
    const store = await getCurrentStore();
    const { user, verificationToken } = await registerCustomer({ ...parsed.data, registeredStoreId: store?.id ?? null }, { ipAddress: meta.ipAddress });
    await startSession(user.id, meta);
    if (store) await mergeGuestCartAfterLogin(user.id, store.id);
    notifyAfterResponse({ type: "user.registered", userId: user.id, verificationToken, storeId: store?.id ?? null });
    destination = safeRedirectPath(parsed.data.next, "/account?welcome=1");
  } catch (error) {
    return handleActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await endSession();
  if (user) await writeAudit({ actorId: user.id, action: "user.logout", entityType: "User", entityId: user.id, summary: "Signed out" });
  revalidatePath("/", "layout");
  redirect("/");
}

export async function forgotPasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return zodFailure(parsed.error);
  const meta = await getRequestMeta();
  const [byIp, byEmail] = await Promise.all([rateLimit("passwordReset", `ip:${meta.ipAddress}`, { limit: 20, windowMs: 60 * 60_000 }), rateLimit("passwordReset", `email:${parsed.data.email}`)]);
  if (!byIp.success || !byEmail.success) return failure(retryAfterMessage(byIp.success ? byEmail.resetAt : byIp.resetAt));
  try {
    const result = await requestPasswordReset(parsed.data.email);
    const store = await getCurrentStore();
    if (result) notifyAfterResponse({ type: "user.password-reset-requested", userId: result.user.id, token: result.token, storeId: store?.id ?? null });
  } catch (error) {
    console.error("[auth] password reset request failed", error);
  }
  // Identical response for known and unknown addresses (no account enumeration).
  return success("If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour.");
}

export async function resetPasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ token: formData.get("token"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  } catch (error) {
    return handleActionError(error);
  }
  await endSession();
  redirect("/login?reset=1");
}

export async function resendVerificationAction(): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return failure("Please sign in first.");
  if (user.emailVerified) return success("Your email address is already confirmed.");
  const limit = await rateLimit("verifyEmail", user.id);
  if (!limit.success) return failure(retryAfterMessage(limit.resetAt));
  const token = await createToken(user.id, TokenType.EMAIL_VERIFICATION);
  const store = await getCurrentStore();
  notifyAfterResponse({ type: "user.verification-requested", userId: user.id, verificationToken: token, storeId: store?.id ?? null });
  return success(`We've sent a new confirmation link to ${user.email}.`);
}

export async function changePasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return failure("Please sign in again.");
  const parsed = changePasswordSchema.safeParse({ currentPassword: formData.get("currentPassword"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return zodFailure(parsed.error);
  const limit = await rateLimit("login", `change:${user.id}`);
  if (!limit.success) return failure(retryAfterMessage(limit.resetAt));
  try {
    await changePassword(user.id, user.sessionId, parsed.data.currentPassword, parsed.data.password);
    return success("Password updated. You've been signed out on your other devices.");
  } catch (error) {
    return handleActionError(error);
  }
}
