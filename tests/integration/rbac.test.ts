import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, hasPermission } from "@/lib/permissions";
import { db } from "@/server/db";

async function permissionsOf(key: string) {
  const role = await db.role.findUniqueOrThrow({ where: { key }, include: { permissions: { include: { permission: { select: { key: true } } } } } });
  return { role, keys: role.permissions.map((entry) => entry.permission.key).sort() };
}

describe("role-based access control seed", () => {
  it("gives the super admin every permission", async () => {
    const { keys } = await permissionsOf("SUPER_ADMIN");
    expect(keys).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("gives admins everything except staff management", async () => {
    const { keys } = await permissionsOf("ADMIN");
    expect(keys).not.toContain("staff.manage");
    expect(keys).toEqual(ALL_PERMISSIONS.filter((permission) => permission !== "staff.manage").sort());
  });

  it("keeps managers below admins and without staff or settings management", async () => {
    const [manager, admin] = await Promise.all([permissionsOf("MANAGER"), permissionsOf("ADMIN")]);
    expect(manager.keys.length).toBeGreaterThan(0);
    expect(manager.keys.length).toBeLessThan(admin.keys.length);
    expect(manager.keys).not.toContain("staff.manage");
    expect(manager.keys).not.toContain("settings.manage");
    expect(manager.role.rank).toBeLessThan(admin.role.rank);
  });

  it("gives customers no admin permissions", async () => {
    const { role, keys } = await permissionsOf("CUSTOMER");
    expect(role.isStaff).toBe(false);
    expect(keys).toEqual([]);
  });

  it("checks permissions against both arrays and sets", () => {
    expect(hasPermission(["orders.view"], "orders.view")).toBe(true);
    expect(hasPermission(new Set(["orders.view"]), "orders.refund")).toBe(false);
  });
});
