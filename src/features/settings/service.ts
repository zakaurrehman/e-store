import type { Prisma } from "@/generated/prisma/client";
import { db, type DbClient } from "@/server/db";
import { parseSettingsSection, SETTINGS_KEYS, settingsSchema, type SettingsKey, type StoreSettings } from "./schema";

export async function loadSettings(client: DbClient = db): Promise<StoreSettings> {
  const rows = await client.setting.findMany({ where: { key: { in: SETTINGS_KEYS } } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const settings = {} as Record<SettingsKey, unknown>;
  for (const key of SETTINGS_KEYS) settings[key] = parseSettingsSection(key, byKey.get(key));
  return settings as StoreSettings;
}

export async function saveSettingsSection<K extends SettingsKey>(key: K, value: unknown, client: DbClient = db) {
  const parsed = settingsSchema[key].parse(value) as StoreSettings[K];
  await client.setting.upsert({
    where: { key },
    create: { key, value: parsed as Prisma.InputJsonValue },
    update: { value: parsed as Prisma.InputJsonValue },
  });
  return parsed;
}
