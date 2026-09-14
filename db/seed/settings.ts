import type { Prisma } from "@/generated/prisma/client";
import { SETTINGS_KEYS, settingsSchema } from "@/features/settings/schema";
import { db } from "@/server/db";

export async function seedSettings() {
  let created = 0;
  for (const key of SETTINGS_KEYS) {
    const exists = await db.setting.findUnique({ where: { key } });
    if (exists) continue;
    await db.setting.create({ data: { key, value: settingsSchema[key].parse({}) as Prisma.InputJsonValue } });
    created++;
  }
  console.log(`✓ settings: ${created} section(s) created`);
}
