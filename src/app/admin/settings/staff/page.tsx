import type { Metadata } from "next";
import { Suspense } from "react";
import { StaffManager } from "@/components/admin/settings/settings-forms";
import { Card, dateOnly, PageHeader } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Staff & roles" };

async function Staff() {
  const viewer = await requirePagePermission("staff.manage", "/admin/settings/staff");
  const [staff, roles] = await Promise.all([
    db.user.findMany({ where: { role: { isStaff: true }, deletedAt: null }, orderBy: [{ role: { rank: "desc" } }, { firstName: "asc" }], include: { role: true } }),
    db.role.findMany({ orderBy: { rank: "desc" }, include: { permissions: { include: { permission: { select: { key: true } } } }, _count: { select: { users: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Staff & roles" description="Control who can access the admin and what they can do." />
      <Card>
        <StaffManager
          staff={staff.map((member) => ({ id: member.id, name: `${member.firstName} ${member.lastName}`, email: member.email, roleId: member.roleId, roleName: member.role.name, roleRank: member.role.rank, status: member.status, lastLoginAt: member.lastLoginAt ? dateOnly.format(member.lastLoginAt) : null }))}
          roles={roles.map((role) => ({ id: role.id, key: role.key, name: role.name, description: role.description, rank: role.rank, isSystem: role.isSystem, permissions: role.permissions.map((entry) => entry.permission.key), memberCount: role._count.users }))}
          viewer={{ id: viewer.id, rank: viewer.role.rank, permissions: viewer.permissions }}
        />
      </Card>
    </>
  );
}

export default function StaffPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Staff />
    </Suspense>
  );
}
