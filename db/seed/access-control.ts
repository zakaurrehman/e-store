import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import { db } from "@/server/db";

/**
 * Synchronises the permission catalogue and system roles.
 * Custom permission assignments made in the admin are preserved on re-run, except SUPER_ADMIN
 * which always holds every permission.
 */
export async function seedAccessControl() {
  // Permissions added to the catalogue since the last run are granted to the system roles that define them.
  const known = new Set((await db.permission.findMany({ select: { key: true } })).map((permission) => permission.key));
  const introduced = new Set(ALL_PERMISSIONS.filter((key) => !known.has(key)));
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      create: { key, group: meta.group, description: meta.description },
      update: { group: meta.group, description: meta.description },
    });
  }
  await db.permission.deleteMany({ where: { key: { notIn: ALL_PERMISSIONS } } });

  const permissions = await db.permission.findMany();
  const idByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  for (const [key, definition] of Object.entries(SYSTEM_ROLES)) {
    const existing = await db.role.findUnique({ where: { key } });
    const role = await db.role.upsert({
      where: { key },
      create: {
        key,
        name: definition.name,
        description: definition.description,
        rank: definition.rank,
        isStaff: definition.isStaff,
        isSystem: true,
      },
      update: { rank: definition.rank, isStaff: definition.isStaff, isSystem: true },
    });
    const grant = !existing || key === "SUPER_ADMIN" ? definition.permissions : definition.permissions.filter((permission) => introduced.has(permission));
    if (grant.length) {
      await db.rolePermission.createMany({
        data: grant.map((permission) => ({ roleId: role.id, permissionId: idByKey.get(permission)! })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`✓ access control: ${ALL_PERMISSIONS.length} permissions, ${Object.keys(SYSTEM_ROLES).length} roles`);
}
