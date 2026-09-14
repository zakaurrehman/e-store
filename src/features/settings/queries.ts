import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { loadSettings } from "./service";

export const SETTINGS_TAG = "settings";

export async function getStoreSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);
  return loadSettings();
}
