"use server";

import { revalidatePath } from "next/cache";
import { ContactStatus } from "@/generated/prisma/enums";
import { failure, handleActionError, type ActionState } from "@/server/actions";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export async function setMessageStatusAction(id: string, status: string): Promise<ActionState> {
  try {
    await assertPermission("messages.view");
    if (!(status in ContactStatus)) return failure("Unknown status.");
    await db.contactMessage.update({ where: { id }, data: { status: status as ContactStatus } });
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return { status: "success", message: "Message updated." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function markStaffNotificationsReadAction(): Promise<ActionState> {
  try {
    const user = await assertPermission("dashboard.view");
    await db.notification.updateMany({ where: { audience: "STAFF", readAt: null, OR: [{ userId: null }, { userId: user.id }] }, data: { readAt: new Date() } });
    revalidatePath("/admin", "layout");
    return { status: "success" };
  } catch (error) {
    return handleActionError(error);
  }
}
