"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton, ActionForm } from "@/components/admin/forms";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MarkdownContent } from "@/components/ui/markdown";
import { deletePageAction, savePageAction } from "@/features/admin/content";
import { cn } from "@/utils/cn";

export type PageData = { id: string; title: string; slug: string; excerpt: string | null; content: string; status: "DRAFT" | "PUBLISHED"; seoTitle: string | null; seoDescription: string | null };

export function PageEditor({ page }: { page: PageData | null }) {
  const router = useRouter();
  const [content, setContent] = useState(page?.content ?? "");
  const [preview, setPreview] = useState(false);
  return (
    <ActionForm action={savePageAction} submitLabel={page ? "Save page" : "Create page"} redirectTo={page ? undefined : (data) => `/admin/content/pages/${(data as { id: string }).id}`} footer={page ? <ActionButton variant="ghost" className="text-danger hover:bg-danger-soft" action={() => deletePageAction(page.id)} confirm={{ title: `Delete “${page.title}”?`, destructive: true, confirmLabel: "Delete" }} onSuccess={() => router.push("/admin/content/pages")}>Delete page</ActionButton> : undefined}>
      {page && <input type="hidden" name="id" value={page.id} />}
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" defaultValue={page?.title ?? ""} required maxLength={120} />
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="content" className="text-[0.8125rem] font-medium text-ink-800">
                Content (Markdown)
              </label>
              <div className="flex rounded-sm border border-line text-[0.75rem]">
                <button type="button" onClick={() => setPreview(false)} className={cn("px-2.5 py-1", !preview && "bg-ink-950 text-white")} aria-pressed={!preview}>
                  Write
                </button>
                <button type="button" onClick={() => setPreview(true)} className={cn("px-2.5 py-1", preview && "bg-ink-950 text-white")} aria-pressed={preview}>
                  Preview
                </button>
              </div>
            </div>
            <textarea id="content" name="content" value={content} onChange={(event) => setContent(event.target.value)} rows={24} className={cn("block w-full rounded-sm border border-line-strong px-3.5 py-2.5 font-mono text-[0.8125rem] leading-relaxed outline-none focus:border-ink-950", preview && "hidden")} />
            {preview && (
              <div className="min-h-[24rem] rounded-sm border border-line p-6">
                <MarkdownContent content={content} />
              </div>
            )}
            <p className="mt-1.5 text-[0.8125rem] text-ink-500">Headings (## Title), lists, tables, **bold** and [links](/pages/returns) are supported. Raw HTML is not rendered.</p>
          </div>
        </div>
        <div className="space-y-4 xl:col-span-4">
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={page?.status ?? "DRAFT"}>
              <option value="DRAFT">Draft — not visible</option>
              <option value="PUBLISHED">Published</option>
            </Select>
          </Field>
          <Field label="Slug" htmlFor="slug" optional hint={page ? <Link href={`/pages/${page.slug}`} target="_blank" className="underline underline-offset-2">/pages/{page.slug}</Link> : "Generated from the title if empty."}>
            <Input id="slug" name="slug" defaultValue={page?.slug ?? ""} />
          </Field>
          <Field label="Excerpt" htmlFor="excerpt" optional hint="Intro line under the title; also the default meta description.">
            <Textarea id="excerpt" name="excerpt" rows={3} defaultValue={page?.excerpt ?? ""} maxLength={300} />
          </Field>
          <Field label="SEO title" htmlFor="seoTitle" optional>
            <Input id="seoTitle" name="seoTitle" defaultValue={page?.seoTitle ?? ""} maxLength={120} />
          </Field>
          <Field label="Meta description" htmlFor="seoDescription" optional>
            <Textarea id="seoDescription" name="seoDescription" rows={2} defaultValue={page?.seoDescription ?? ""} maxLength={320} />
          </Field>
        </div>
      </div>
    </ActionForm>
  );
}
