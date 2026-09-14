import { hashPassword, passwordProblem } from "@/server/auth/password";
import { db } from "@/server/db";

export async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    console.log("• admin: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipped");
    return;
  }
  const problem = password.length < 12 ? "must be at least 12 characters" : passwordProblem(password, { email });
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD ${problem}`);

  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.roleId !== role.id) await db.user.update({ where: { id: existing.id }, data: { roleId: role.id } });
    console.log(`• admin: ${email} already exists (password unchanged)`);
    return;
  }
  await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: "Store",
      lastName: "Owner",
      roleId: role.id,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`✓ admin: created super admin ${email}`);
}
