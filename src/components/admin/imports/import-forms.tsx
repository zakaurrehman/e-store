"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc-client";
import { importCsvAction, importWooCommerceAction } from "@/features/admin/imports";
import { idleState, type ActionState } from "@/lib/action-state";

type Result = { runId: string | null; summary: string; log: string[] };

function ResultView({ state }: { state: ActionState<Result> }) {
  if (state.status !== "success" || !state.data) return <FormMessage state={state} className="mt-4" />;
  return (
    <div className="mt-4 space-y-3">
      <Alert tone="success" title="Import finished">
        {state.data.summary}
      </Alert>
      {state.data.log.length > 0 && <pre className="max-h-64 overflow-auto rounded-sm bg-ink-950 p-3 text-[0.75rem] leading-relaxed text-ink-200">{state.data.log.join("\n")}</pre>}
    </div>
  );
}

/** Submit without React's automatic form reset, so a refused import keeps the chosen file and options. */
const keepValues = (dispatch: (formData: FormData) => void) => (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  startTransition(() => dispatch(formData));
};

function CommonOptions({ prefix }: { prefix: string }) {
  return (
    <div className="space-y-2">
      <Checkbox id={`${prefix}-dry`} name="dryRun" label="Dry run — report what would change without writing anything" />
      <Checkbox id={`${prefix}-draft`} name="draft" label="Import products as drafts for review before publishing" />
      <Checkbox id={`${prefix}-skip`} name="skipImages" label="Skip images (import them later with the images entity)" />
      <Checkbox id={`${prefix}-auth`} name="authorized" label="I confirm I hold the rights to reuse this content (names, descriptions, images)" />
    </div>
  );
}

export function CsvImportForm() {
  const [state, action, pending] = useActionState<ActionState<Result>, FormData>(importCsvAction, idleState as ActionState<Result>);
  return (
    <form onSubmit={keepValues(action)} className="space-y-4">
      <Field label="CSV file" htmlFor="csv-file" hint="Use the format produced by Export CSV (one row per variant). Re-importing an export updates existing products in place.">
        <input id="csv-file" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-4 file:h-10 file:cursor-pointer file:rounded-sm file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-medium hover:file:border-ink-950" />
      </Field>
      <CommonOptions prefix="csv" />
      <SubmitButton loading={pending}>Run CSV import</SubmitButton>
      <ResultView state={state} />
    </form>
  );
}

export function WooCommerceImportForm({ defaultUrl }: { defaultUrl: string }) {
  const [state, action, pending] = useActionState<ActionState<Result>, FormData>(importWooCommerceAction, idleState as ActionState<Result>);
  return (
    <form onSubmit={keepValues(action)} className="space-y-4">
      <Field label="Store URL" htmlFor="woo-url" hint="Reads the public WooCommerce Store API (no credentials). Variable products are expanded into variants.">
        <Input id="woo-url" name="url" type="url" defaultValue={defaultUrl} placeholder="https://shop.example.com" required />
      </Field>
      <Field label="What to import" htmlFor="woo-entity">
        <Select id="woo-entity" name="entity" defaultValue="all">
          <option value="all">Everything (categories, products, images)</option>
          <option value="categories">Categories only</option>
          <option value="products">Products (with their categories)</option>
          <option value="images">Images for already-imported products</option>
        </Select>
      </Field>
      <CommonOptions prefix="woo" />
      <SubmitButton loading={pending}>Run WooCommerce import</SubmitButton>
      <ResultView state={state} />
    </form>
  );
}
