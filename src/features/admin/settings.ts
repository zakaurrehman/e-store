"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { SETTINGS_TAG } from "@/features/settings/queries";
import { settingsSchema, type SettingsKey } from "@/features/settings/schema";
import { saveSettingsSection } from "@/features/settings/service";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { deleteUserSessions } from "@/server/auth/session-store";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { failure, handleActionError, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertPermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { isCountryCode } from "@/lib/countries";
import { parseMoneyToCents } from "@/utils/money";

const bool = (value: FormDataEntryValue | null | undefined) => value === "on" || value === "true";

// ─── Store settings ──────────────────────────────────────────────────────────

export async function saveSettingsAction(section: SettingsKey, _state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("settings.manage");
    if (!(section in settingsSchema)) return failure("Unknown settings section.");
    const shape = settingsSchema[section].shape as Record<string, z.ZodTypeAny>;
    const raw: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(shape)) {
      const value = formData.get(key);
      const inner = field instanceof z.ZodDefault ? field.def.innerType : field;
      if (inner instanceof z.ZodBoolean) raw[key] = bool(value);
      else if (inner instanceof z.ZodNumber) raw[key] = value === null || value === "" ? undefined : Number(value);
      else raw[key] = value === null ? undefined : String(value);
    }
    const parsed = settingsSchema[section].safeParse(raw);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.", Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), [issue.message]])));
    await saveSettingsSection(section, parsed.data);
    await writeAudit({ actorId: user.id, action: "settings.update", entityType: "Setting", entityId: section, summary: `Updated ${section} settings` });
    updateTag(SETTINGS_TAG);
    revalidatePath("/", "layout");
    return { status: "success", message: "Settings saved." };
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Shipping & tax ──────────────────────────────────────────────────────────

const zoneSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Enter a zone name.").max(80), countries: z.string().trim() });

export async function saveShippingZoneAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("shipping.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = zoneSchema.safeParse({ ...raw, id: raw.id || undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const countries = parsed.data.countries === "*" ? ["*"] : [...new Set(parsed.data.countries.split(/[\s,]+/).map((code) => code.trim().toUpperCase()).filter(Boolean))];
    const invalid = countries.filter((code) => code !== "*" && !isCountryCode(code));
    if (invalid.length) return failure(`Unknown country code: ${invalid.join(", ")}`);
    if (countries.length === 0) return failure("Enter at least one country code, or * for rest of world.");
    if (parsed.data.id) await db.shippingZone.update({ where: { id: parsed.data.id }, data: { name: parsed.data.name, countries } });
    else await db.shippingZone.create({ data: { name: parsed.data.name, countries, position: await db.shippingZone.count() } });
    await writeAudit({ actorId: user.id, action: "shipping.zone", entityType: "ShippingZone", entityId: parsed.data.id, summary: `Saved shipping zone “${parsed.data.name}”` });
    revalidatePath("/admin/settings/shipping");
    return { status: "success", message: "Zone saved." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteShippingZoneAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("shipping.manage");
    await db.shippingZone.delete({ where: { id } });
    revalidatePath("/admin/settings/shipping");
    return { status: "success", message: "Zone deleted." };
  } catch (error) {
    return handleActionError(error);
  }
}

const methodSchema = z.object({ id: z.string().optional(), zoneId: z.string(), name: z.string().trim().min(1, "Enter a name.").max(60), description: z.string().trim().max(120).optional(), price: z.string().trim(), freeOver: z.string().trim().optional(), minDays: z.coerce.number().int().min(0).max(120), maxDays: z.coerce.number().int().min(0).max(120), isActive: z.string().optional() });

export async function saveShippingMethodAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("shipping.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = methodSchema.safeParse({ ...raw, id: raw.id || undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const priceCents = parseMoneyToCents(parsed.data.price);
    if (priceCents === null || priceCents < 0) return failure("Enter a valid price.");
    const freeOverCents = parsed.data.freeOver ? parseMoneyToCents(parsed.data.freeOver) : null;
    if (parsed.data.maxDays < parsed.data.minDays) return failure("Maximum days must be at least the minimum.");
    const data = { zoneId: parsed.data.zoneId, name: parsed.data.name, description: parsed.data.description || null, priceCents, freeOverCents, minDays: parsed.data.minDays, maxDays: parsed.data.maxDays, isActive: bool(parsed.data.isActive) };
    if (parsed.data.id) await db.shippingMethod.update({ where: { id: parsed.data.id }, data });
    else await db.shippingMethod.create({ data: { ...data, position: await db.shippingMethod.count({ where: { zoneId: data.zoneId } }) } });
    revalidatePath("/admin/settings/shipping");
    return { status: "success", message: "Delivery method saved." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteShippingMethodAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("shipping.manage");
    await db.shippingMethod.update({ where: { id }, data: { isActive: false } });
    await db.shippingMethod.delete({ where: { id } }).catch(() => undefined);
    revalidatePath("/admin/settings/shipping");
    return { status: "success", message: "Delivery method removed." };
  } catch (error) {
    return handleActionError(error);
  }
}

const taxSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Enter a name.").max(80), country: z.string().trim().toUpperCase().refine(isCountryCode, "Unknown country code."), region: z.string().trim().max(10).optional(), rate: z.string().trim(), appliesToShipping: z.string().optional(), isActive: z.string().optional() });

export async function saveTaxRateAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertPermission("shipping.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = taxSchema.safeParse({ ...raw, id: raw.id || undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const rate = Number(parsed.data.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return failure("Enter a rate between 0 and 100.");
    const data = { name: parsed.data.name, country: parsed.data.country, region: parsed.data.region?.toUpperCase() || null, rateBps: Math.round(rate * 100), appliesToShipping: bool(parsed.data.appliesToShipping), isActive: bool(parsed.data.isActive) };
    const clash = await db.taxRate.findFirst({ where: { country: data.country, region: data.region } });
    if (clash && clash.id !== parsed.data.id) return failure("A rate for that country/region already exists.");
    if (parsed.data.id) await db.taxRate.update({ where: { id: parsed.data.id }, data });
    else await db.taxRate.create({ data });
    revalidatePath("/admin/settings/shipping");
    return { status: "success", message: "Tax rate saved." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function deleteTaxRateAction(id: string): Promise<ActionState> {
  try {
    await assertPermission("shipping.manage");
    await db.taxRate.delete({ where: { id } });
    revalidatePath("/admin/settings/shipping");
    return { status: "success", message: "Tax rate deleted." };
  } catch (error) {
    return handleActionError(error);
  }
}

// ─── Staff & roles ───────────────────────────────────────────────────────────

const staffSchema = z.object({ id: z.string().optional(), firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60), email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")), roleId: z.string(), password: z.string().optional() });

export async function saveStaffAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await assertPermission("staff.manage");
    const raw = Object.fromEntries(formData.entries());
    const parsed = staffSchema.safeParse({ ...raw, id: raw.id || undefined });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const role = await db.role.findUnique({ where: { id: parsed.data.roleId } });
    if (!role) return failure("Choose a role.");
    if (role.rank > actor.role.rank) return failure("You can't assign a role above your own.");
    const existing = await db.user.findUnique({ where: { email: parsed.data.email }, include: { role: true } });
    if (parsed.data.id) {
      const target = await db.user.findUnique({ where: { id: parsed.data.id }, include: { role: true } });
      if (!target) return failure("User not found.");
      if (target.role.rank > actor.role.rank) return failure("You can't edit a user with a higher role than yours.");
      if (existing && existing.id !== target.id) return failure("That email is already in use.");
      await db.user.update({ where: { id: target.id }, data: { firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email, roleId: role.id } });
      if (target.roleId !== role.id) await deleteUserSessions(target.id);
      await writeAudit({ actorId: actor.id, action: "staff.update", entityType: "User", entityId: target.id, summary: `Updated ${parsed.data.email} → ${role.name}` });
      return { status: "success", message: "Staff member updated." };
    }
    if (existing) {
      if (existing.role.rank > actor.role.rank) return failure("That account has a higher role than yours.");
      await db.user.update({ where: { id: existing.id }, data: { roleId: role.id } });
      await deleteUserSessions(existing.id);
      await writeAudit({ actorId: actor.id, action: "staff.promote", entityType: "User", entityId: existing.id, summary: `Changed role of ${existing.email} to ${role.name}` });
      revalidatePath("/admin/settings/staff");
      return { status: "success", message: `${existing.email} now has the ${role.name} role.` };
    }
    const password = parsed.data.password ?? "";
    const problem = password.length < 12 ? "Temporary password must be at least 12 characters." : passwordProblem(password, { email: parsed.data.email });
    if (problem) return failure(problem, { password: [problem] });
    const created = await db.user.create({ data: { firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email, roleId: role.id, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } });
    await writeAudit({ actorId: actor.id, action: "staff.create", entityType: "User", entityId: created.id, summary: `Created staff account ${created.email} (${role.name})` });
    revalidatePath("/admin/settings/staff");
    return { status: "success", message: "Staff account created. Share the temporary password securely and ask them to change it." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function removeStaffAction(userId: string): Promise<ActionState> {
  try {
    const actor = await assertPermission("staff.manage");
    if (userId === actor.id) return failure("You can't remove your own access.");
    const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) return failure("User not found.");
    if (target.role.rank > actor.role.rank) return failure("You can't remove a user with a higher role.");
    const customer = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
    await db.user.update({ where: { id: userId }, data: { roleId: customer.id } });
    await deleteUserSessions(userId);
    await writeAudit({ actorId: actor.id, action: "staff.remove", entityType: "User", entityId: userId, summary: `Removed staff access from ${target.email}` });
    revalidatePath("/admin/settings/staff");
    return { status: "success", message: "Staff access removed; the account is now a customer account." };
  } catch (error) {
    return handleActionError(error);
  }
}

const roleSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Enter a role name.").max(60), description: z.string().trim().max(200).optional(), rank: z.coerce.number().int().min(1).max(99), permissions: z.array(z.string()) });

export async function saveRoleAction(input: unknown): Promise<ActionState> {
  try {
    const actor = await assertPermission("staff.manage");
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    const permissions = parsed.data.permissions.filter((permission): permission is Permission => ALL_PERMISSIONS.includes(permission as Permission));
    if (!actor.permissions.includes("staff.manage")) return failure("Forbidden.");
    if (permissions.some((permission) => !actor.permissions.includes(permission))) return failure("You can only grant permissions you hold yourself.");
    const existing = parsed.data.id ? await db.role.findUnique({ where: { id: parsed.data.id } }) : null;
    if (existing?.isSystem && existing.key === "SUPER_ADMIN") return failure("The super admin role can't be edited.");
    if (existing && existing.rank > actor.role.rank) return failure("You can't edit a role above your own.");
    const rank = Math.min(parsed.data.rank, actor.role.rank - 1);
    const role = existing
      ? await db.role.update({ where: { id: existing.id }, data: { name: parsed.data.name, description: parsed.data.description || null, ...(existing.isSystem ? {} : { rank }) } })
      : await db.role.create({ data: { key: `custom_${Date.now().toString(36)}`, name: parsed.data.name, description: parsed.data.description || null, rank, isStaff: true } });
    const catalogue = await db.permission.findMany({ where: { key: { in: permissions } }, select: { id: true } });
    await db.$transaction([db.rolePermission.deleteMany({ where: { roleId: role.id } }), db.rolePermission.createMany({ data: catalogue.map((permission) => ({ roleId: role.id, permissionId: permission.id })) })]);
    await deleteUserSessionsForRole(role.id);
    await writeAudit({ actorId: actor.id, action: existing ? "role.update" : "role.create", entityType: "Role", entityId: role.id, summary: `${existing ? "Updated" : "Created"} role “${role.name}” with ${permissions.length} permissions` });
    revalidatePath("/admin/settings/staff");
    return { status: "success", message: existing ? "Role updated. Members will see the change on their next request." : "Role created." };
  } catch (error) {
    return handleActionError(error);
  }
}

async function deleteUserSessionsForRole(roleId: string) {
  // Permissions are read from the role on every request, so no session invalidation is required;
  // kept as a hook in case cached permission snapshots are introduced later.
  void roleId;
}

export async function deleteRoleAction(id: string): Promise<ActionState> {
  try {
    const actor = await assertPermission("staff.manage");
    const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) return failure("Role not found.");
    if (role.isSystem) return failure("System roles can't be deleted.");
    if (role._count.users > 0) return failure("Reassign its members to another role first.");
    await db.role.delete({ where: { id } });
    await writeAudit({ actorId: actor.id, action: "role.delete", entityType: "Role", entityId: id, summary: `Deleted role “${role.name}”` });
    revalidatePath("/admin/settings/staff");
    return { status: "success", message: "Role deleted." };
  } catch (error) {
    return handleActionError(error);
  }
}
