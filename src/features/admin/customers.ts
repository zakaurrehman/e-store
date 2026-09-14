"use server";

import { revalidatePath } from "next/cache";
import { TokenType, UserStatus } from "@/generated/prisma/enums";
import { createToken } from "@/features/auth/service";
import { failure, handleActionError, success, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertPermission } from "@/server/auth/guards";
import { deleteUserSessions } from "@/server/auth/session-store";
import { db } from "@/server/db";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";

export async function setCustomerStatusAction(userId: string, status: "ACTIVE" | "DISABLED"): Promise<ActionState> {
  try {
    const actor = await assertPermission("customers.update");
    const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) return failure("Customer not found.");
    if (target.id === actor.id) return failure("You can't disable your own account.");
    if (target.role.isStaff && target.role.rank >= actor.role.rank) return failure("You can't change the status of a staff member with an equal or higher role.");
    await db.user.update({ where: { id: userId }, data: { status: status === "DISABLED" ? UserStatus.DISABLED : UserStatus.ACTIVE } });
    if (status === "DISABLED") await deleteUserSessions(userId);
    await writeAudit({ actorId: actor.id, action: status === "DISABLED" ? "user.disable" : "user.enable", entityType: "User", entityId: userId, summary: `${status === "DISABLED" ? "Disabled" : "Re-enabled"} account ${target.email}` });
    revalidatePath(`/admin/customers/${userId}`);
    return success(status === "DISABLED" ? "Account disabled and signed out everywhere." : "Account re-enabled.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Forces a password reset: existing sessions end, login is blocked until the emailed link is used. */
export async function forcePasswordResetAction(userId: string): Promise<ActionState> {
  try {
    const actor = await assertPermission("customers.update");
    const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) return failure("Customer not found.");
    if (target.role.isStaff && target.role.rank >= actor.role.rank && target.id !== actor.id) return failure("You can't reset access for a staff member with an equal or higher role.");
    await db.user.update({ where: { id: userId }, data: { mustResetPassword: true } });
    await deleteUserSessions(userId);
    const token = await createToken(userId, TokenType.PASSWORD_RESET);
    await sendDeliveries(await dispatchNotification({ type: "user.password-reset-requested", userId, token }));
    await writeAudit({ actorId: actor.id, action: "user.force_reset", entityType: "User", entityId: userId, summary: `Forced password reset for ${target.email}` });
    revalidatePath(`/admin/customers/${userId}`);
    return success(`Reset link sent to ${target.email}. They can't sign in until it's used.`);
  } catch (error) {
    return handleActionError(error);
  }
}
