"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { CATALOG_TAG } from "@/features/catalog/queries";
import { runImport } from "@/features/import/importer";
import { CsvSource, WooCommerceStoreSource } from "@/features/import/sources";
import { failure, handleActionError, type ActionState } from "@/server/actions";
import { writeAudit } from "@/server/audit";
import { assertPermission } from "@/server/auth/guards";

type ImportResult = { runId: string | null; summary: string; log: string[] };

export async function importCsvAction(_state: ActionState<ImportResult>, formData: FormData): Promise<ActionState<ImportResult>> {
  try {
    const user = await assertPermission("products.import");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return failure("Choose a CSV file.");
    if (file.size > 20 * 1024 * 1024) return failure("CSV files must be 20 MB or smaller.");
    if (formData.get("authorized") !== "on") return failure("Confirm that you hold the rights to the content you are importing.");
    const text = await file.text();
    const log: string[] = [];
    const { runId, stats } = await runImport({ source: new CsvSource(text, file.name), entity: "all", dryRun: formData.get("dryRun") === "on", asDraft: formData.get("draft") === "on", skipImages: formData.get("skipImages") === "on", actorId: user.id, log: (message) => log.push(message) });
    await writeAudit({ actorId: user.id, action: "import.csv", entityType: "ImportRun", entityId: runId ?? undefined, summary: `Imported CSV ${file.name}: ${stats.products.created} created, ${stats.products.updated} updated, ${stats.products.failed} failed` });
    updateTag(CATALOG_TAG);
    revalidatePath("/admin/imports");
    return { status: "success", message: "Import finished.", data: { runId, summary: `Products: ${stats.products.created} created, ${stats.products.updated} updated, ${stats.products.skipped} unchanged, ${stats.products.failed} failed · Categories: ${stats.categories.created} created · Images: ${stats.images.downloaded} downloaded, ${stats.images.reused} reused, ${stats.images.failed} failed`, log: log.slice(-200) } };
  } catch (error) {
    return handleActionError(error);
  }
}

const wooSchema = z.object({ url: z.url("Enter the store URL, e.g. https://shop.example.com"), entity: z.enum(["categories", "products", "images", "all"]) });

export async function importWooCommerceAction(_state: ActionState<ImportResult>, formData: FormData): Promise<ActionState<ImportResult>> {
  try {
    const user = await assertPermission("products.import");
    const parsed = wooSchema.safeParse({ url: String(formData.get("url") ?? "").trim(), entity: formData.get("entity") });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Check the form.");
    if (formData.get("authorized") !== "on") return failure("Confirm that you hold the rights to the content you are importing.");
    const log: string[] = [];
    const { runId, stats } = await runImport({ source: new WooCommerceStoreSource(parsed.data.url), entity: parsed.data.entity, dryRun: formData.get("dryRun") === "on", asDraft: formData.get("draft") === "on", skipImages: formData.get("skipImages") === "on", actorId: user.id, log: (message) => log.push(message) });
    await writeAudit({ actorId: user.id, action: "import.woocommerce", entityType: "ImportRun", entityId: runId ?? undefined, summary: `Imported ${parsed.data.entity} from ${parsed.data.url}: ${stats.products.created} created, ${stats.products.updated} updated` });
    updateTag(CATALOG_TAG);
    revalidatePath("/admin/imports");
    return { status: "success", message: "Import finished.", data: { runId, summary: `Products: ${stats.products.created} created, ${stats.products.updated} updated, ${stats.products.skipped} unchanged, ${stats.products.failed} failed · Categories: ${stats.categories.created} created, ${stats.categories.updated} updated · Images: ${stats.images.downloaded} downloaded, ${stats.images.reused} reused, ${stats.images.failed} failed`, log: log.slice(-200) } };
  } catch (error) {
    return handleActionError(error);
  }
}
