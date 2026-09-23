"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActionButton, ActionForm } from "@/components/admin/forms";
import { SortableList } from "@/components/admin/catalog/sortable-list";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { deleteAttributeAction, deleteBrandAction, deleteCategoryAction, deleteCollectionAction, deleteTagAction, reorderAction, saveAttributeAction, saveBrandAction, saveCategoryAction, saveCollectionAction, saveTagAction } from "@/features/admin/catalog/actions";
import { cn } from "@/utils/cn";

const productCount = (count: number) => `${count} product${count === 1 ? "" : "s"}`;

export type CategoryNode = { id: string; name: string; slug: string; parentId: string | null; description: string | null; isActive: boolean; showInNav: boolean; seoTitle: string | null; seoDescription: string | null; productCount: number; children: CategoryNode[] };
export type BrandRow = { id: string; name: string; slug: string; description: string | null; story: string | null; website: string | null; isActive: boolean; isFeatured: boolean; seoTitle: string | null; seoDescription: string | null; productCount: number };
export type CollectionRow = { id: string; name: string; slug: string; description: string | null; rule: string; isActive: boolean; seoTitle: string | null; seoDescription: string | null; productCount: number };
export type TagRow = { id: string; name: string; slug: string; productCount: number };
export type AttributeRow = { id: string; name: string; slug: string; type: string; isVariantOption: boolean; isFilterable: boolean; values: Array<{ value: string; colorHex: string | null }> };

const RULE_LABELS: Record<string, string> = { MANUAL: "Manual selection", NEW_ARRIVALS: "New arrivals (auto)", ON_SALE: "On sale (auto)", BEST_SELLERS: "Best sellers (auto)", TOP_RATED: "Top rated (auto)", FEATURED: "Featured products (auto)" };

function SeoFields({ seoTitle, seoDescription }: { seoTitle: string | null; seoDescription: string | null }) {
  return (
    <details className="rounded-sm border border-line p-3">
      <summary className="cursor-pointer text-[0.8125rem] font-medium">Search engine listing</summary>
      <div className="mt-3 space-y-3">
        <Field label="SEO title" htmlFor="seoTitle" optional>
          <Input id="seoTitle" name="seoTitle" defaultValue={seoTitle ?? ""} maxLength={120} />
        </Field>
        <Field label="Meta description" htmlFor="seoDescription" optional>
          <Textarea id="seoDescription" name="seoDescription" rows={2} defaultValue={seoDescription ?? ""} maxLength={320} />
        </Field>
      </div>
    </details>
  );
}

// ─── Categories ──────────────────────────────────────────────────────────────

function CategoryForm({ category, parents, parentId, onDone }: { category: CategoryNode | null; parents: CategoryNode[]; parentId?: string | null; onDone: () => void }) {
  return (
    <ActionForm action={saveCategoryAction} submitLabel={category ? "Save" : "Create category"} onSuccess={onDone}>
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="space-y-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" defaultValue={category?.name ?? ""} required autoFocus />
        </Field>
        <Field label="Slug" htmlFor="slug" optional hint="Leave empty to generate from the name.">
          <Input id="slug" name="slug" defaultValue={category?.slug ?? ""} />
        </Field>
        <Field label="Parent" htmlFor="parentId">
          <Select id="parentId" name="parentId" defaultValue={category?.parentId ?? parentId ?? ""}>
            <option value="">None (top-level department)</option>
            {parents.filter((parent) => parent.id !== category?.id).map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="description" optional>
          <Textarea id="description" name="description" rows={2} defaultValue={category?.description ?? ""} />
        </Field>
        <div className="flex gap-6">
          <Checkbox id="isActive" name="isActive" defaultChecked={category?.isActive ?? true} label="Active" />
          <Checkbox id="showInNav" name="showInNav" defaultChecked={category?.showInNav ?? true} label="Show in navigation" />
        </div>
        <SeoFields seoTitle={category?.seoTitle ?? null} seoDescription={category?.seoDescription ?? null} />
      </div>
    </ActionForm>
  );
}

export function CategoriesManager({ tree }: { tree: CategoryNode[] }) {
  const [editing, setEditing] = useState<{ category: CategoryNode | null; parentId?: string | null } | null>(null);
  const render = (node: CategoryNode, depth: number) => (
    <div className={cn("flex items-center justify-between gap-3 py-2", depth > 0 && "pl-1")}>
      <div className="min-w-0">
        <span className={cn("text-sm", depth === 0 ? "font-semibold" : "text-ink-800", !node.isActive && "line-through opacity-60")}>{node.name}</span>
        <span className="ml-2 text-[0.75rem] text-ink-500">
          /c/{node.slug} · {productCount(node.productCount)}{!node.showInNav && " · hidden from nav"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {depth === 0 && (
          <Button size="xs" variant="ghost" onClick={() => setEditing({ category: null, parentId: node.id })}>
            <Plus className="size-3.5" /> Sub
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => setEditing({ category: node })} aria-label={`Edit ${node.name}`}>
          <Pencil className="size-3.5" />
        </Button>
        <ActionButton size="xs" variant="ghost" action={() => deleteCategoryAction(node.id)} confirm={{ title: `Delete “${node.name}”?`, description: "Products stay in the catalogue but leave this category.", destructive: true, confirmLabel: "Delete" }}>
          <Trash2 className="size-3.5 text-danger" />
        </ActionButton>
      </div>
    </div>
  );
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing({ category: null })}>
          <Plus className="size-4" /> New department
        </Button>
      </div>
      <SortableList
        items={tree}
        onReorder={(ids) => reorderAction("category", ids)}
        className="divide-y divide-line rounded-md border border-line"
        rowClassName="px-2"
        render={(node) => (
          <div>
            {render(node, 0)}
            {node.children.length > 0 && (
              <SortableList items={node.children} onReorder={(ids) => reorderAction("category", ids)} className="mb-2 ml-4 divide-y divide-line border-l border-line pl-2" render={(child) => render(child, 1)} />
            )}
          </div>
        )}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.category ? `Edit ${editing.category.name}` : "New category"}>
        {editing && <CategoryForm category={editing.category} parents={tree} parentId={editing.parentId} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

// ─── Brands ──────────────────────────────────────────────────────────────────

export function BrandsManager({ brands }: { brands: BrandRow[] }) {
  const [editing, setEditing] = useState<BrandRow | null | "new">(null);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New brand
        </Button>
      </div>
      <SortableList
        items={brands}
        onReorder={(ids) => reorderAction("brand", ids)}
        className="divide-y divide-line rounded-md border border-line"
        rowClassName="px-2"
        render={(brand) => (
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <span className={cn("text-sm font-medium", !brand.isActive && "line-through opacity-60")}>{brand.name}</span>
              <span className="ml-2 text-[0.75rem] text-ink-500">
                <Link href={`/catalog?brand=${brand.slug}`} target="_blank" className="underline-offset-2 hover:underline">
                  /{brand.slug}
                </Link>{" "}
                · {productCount(brand.productCount)}{brand.isFeatured && " · featured"}
              </span>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="xs" variant="ghost" onClick={() => setEditing(brand)} aria-label={`Edit ${brand.name}`}>
                <Pencil className="size-3.5" />
              </Button>
              <ActionButton size="xs" variant="ghost" action={() => deleteBrandAction(brand.id)} confirm={{ title: `Delete “${brand.name}”?`, description: "Products keep their data but lose the brand link.", destructive: true, confirmLabel: "Delete" }}>
                <Trash2 className="size-3.5 text-danger" />
              </ActionButton>
            </div>
          </div>
        )}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New brand" : `Edit ${editing?.name ?? ""}`} className="w-[min(calc(100vw-2rem),40rem)]">
        {editing && (
          <ActionForm action={saveBrandAction} submitLabel={editing === "new" ? "Create brand" : "Save"} onSuccess={() => setEditing(null)}>
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <div className="space-y-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={editing === "new" ? "" : editing.name} required autoFocus />
              </Field>
              <Field label="Slug" htmlFor="slug" optional>
                <Input id="slug" name="slug" defaultValue={editing === "new" ? "" : editing.slug} />
              </Field>
              <Field label="Short description" htmlFor="description" optional>
                <Textarea id="description" name="description" rows={2} defaultValue={editing === "new" ? "" : (editing.description ?? "")} />
              </Field>
              <Field label="Brand story" htmlFor="story" optional hint="Shown on the brand page.">
                <Textarea id="story" name="story" rows={4} defaultValue={editing === "new" ? "" : (editing.story ?? "")} />
              </Field>
              <Field label="Website" htmlFor="website" optional>
                <Input id="website" name="website" type="url" defaultValue={editing === "new" ? "" : (editing.website ?? "")} placeholder="https://" />
              </Field>
              <div className="flex gap-6">
                <Checkbox id="isActive" name="isActive" defaultChecked={editing === "new" ? true : editing.isActive} label="Active" />
                <Checkbox id="isFeatured" name="isFeatured" defaultChecked={editing === "new" ? false : editing.isFeatured} label="Featured on homepage" />
              </div>
              <SeoFields seoTitle={editing === "new" ? null : editing.seoTitle} seoDescription={editing === "new" ? null : editing.seoDescription} />
            </div>
          </ActionForm>
        )}
      </Dialog>
    </div>
  );
}

// ─── Collections ─────────────────────────────────────────────────────────────

export function CollectionsManager({ collections }: { collections: CollectionRow[] }) {
  const [editing, setEditing] = useState<CollectionRow | null | "new">(null);
  return (
    <div>
      <p className="mb-3 text-[0.8125rem] text-ink-500">Automatic collections fill themselves from catalogue data. Manual collections are assigned per product in the product editor.</p>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New collection
        </Button>
      </div>
      <SortableList
        items={collections}
        onReorder={(ids) => reorderAction("collection", ids)}
        className="divide-y divide-line rounded-md border border-line"
        rowClassName="px-2"
        render={(collection) => (
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <span className={cn("text-sm font-medium", !collection.isActive && "line-through opacity-60")}>{collection.name}</span>
              <span className="ml-2 text-[0.75rem] text-ink-500">
                /collections/{collection.slug} · {RULE_LABELS[collection.rule] ?? collection.rule}
                {collection.rule === "MANUAL" && ` · ${productCount(collection.productCount)}`}
              </span>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="xs" variant="ghost" onClick={() => setEditing(collection)} aria-label={`Edit ${collection.name}`}>
                <Pencil className="size-3.5" />
              </Button>
              <ActionButton size="xs" variant="ghost" action={() => deleteCollectionAction(collection.id)} confirm={{ title: `Delete “${collection.name}”?`, destructive: true, confirmLabel: "Delete" }}>
                <Trash2 className="size-3.5 text-danger" />
              </ActionButton>
            </div>
          </div>
        )}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New collection" : `Edit ${editing?.name ?? ""}`}>
        {editing && (
          <ActionForm action={saveCollectionAction} submitLabel={editing === "new" ? "Create collection" : "Save"} onSuccess={() => setEditing(null)}>
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <div className="space-y-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={editing === "new" ? "" : editing.name} required autoFocus />
              </Field>
              <Field label="Slug" htmlFor="slug" optional>
                <Input id="slug" name="slug" defaultValue={editing === "new" ? "" : editing.slug} />
              </Field>
              <Field label="Products" htmlFor="rule">
                <Select id="rule" name="rule" defaultValue={editing === "new" ? "MANUAL" : editing.rule}>
                  {Object.entries(RULE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description" htmlFor="description" optional>
                <Textarea id="description" name="description" rows={2} defaultValue={editing === "new" ? "" : (editing.description ?? "")} />
              </Field>
              <Checkbox id="isActive" name="isActive" defaultChecked={editing === "new" ? true : editing.isActive} label="Active" />
              <SeoFields seoTitle={editing === "new" ? null : editing.seoTitle} seoDescription={editing === "new" ? null : editing.seoDescription} />
            </div>
          </ActionForm>
        )}
      </Dialog>
    </div>
  );
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export function TagsManager({ tags }: { tags: TagRow[] }) {
  const [editing, setEditing] = useState<TagRow | null | "new">(null);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New tag
        </Button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {tags.length === 0 && <li className="text-sm text-ink-500">No tags yet — tags are also created from the product editor.</li>}
        {tags.map((tag) => (
          <li key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-line pl-3 pr-1 text-sm">
            {tag.name} <span className="text-[0.75rem] text-ink-500">({tag.productCount})</span>
            <button type="button" onClick={() => setEditing(tag)} className="rounded-full p-1 text-ink-500 hover:text-ink-950" aria-label={`Edit ${tag.name}`}>
              <Pencil className="size-3" />
            </button>
            <ActionButton size="xs" variant="ghost" className="size-6 rounded-full p-0" action={() => deleteTagAction(tag.id)} confirm={{ title: `Delete tag “${tag.name}”?`, destructive: true, confirmLabel: "Delete" }}>
              <Trash2 className="size-3 text-danger" />
            </ActionButton>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New tag" : "Edit tag"}>
        {editing && (
          <ActionForm action={saveTagAction} submitLabel="Save" onSuccess={() => setEditing(null)}>
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={editing === "new" ? "" : editing.name} required maxLength={40} autoFocus />
            </Field>
          </ActionForm>
        )}
      </Dialog>
    </div>
  );
}

// ─── Attributes ──────────────────────────────────────────────────────────────

export function AttributesManager({ attributes }: { attributes: AttributeRow[] }) {
  const [editing, setEditing] = useState<AttributeRow | null | "new">(null);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New attribute
        </Button>
      </div>
      <SortableList
        items={attributes}
        onReorder={(ids) => reorderAction("attribute", ids)}
        className="divide-y divide-line rounded-md border border-line"
        rowClassName="px-2"
        render={(attribute) => (
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <span className="text-sm font-medium">{attribute.name}</span>
              <span className="ml-2 text-[0.75rem] text-ink-500">
                {attribute.type.toLowerCase()} · {attribute.isVariantOption ? "variant option" : "product fact"} · {attribute.isFilterable ? "filterable" : "not filterable"}
              </span>
              <p className="mt-0.5 truncate text-[0.75rem] text-ink-500">{attribute.values.map((value) => value.value).join(", ")}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="xs" variant="ghost" onClick={() => setEditing(attribute)} aria-label={`Edit ${attribute.name}`}>
                <Pencil className="size-3.5" />
              </Button>
              <ActionButton size="xs" variant="ghost" action={() => deleteAttributeAction(attribute.id)} confirm={{ title: `Delete “${attribute.name}”?`, destructive: true, confirmLabel: "Delete" }}>
                <Trash2 className="size-3.5 text-danger" />
              </ActionButton>
            </div>
          </div>
        )}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New attribute" : `Edit ${editing?.name ?? ""}`}>
        {editing && (
          <ActionForm action={saveAttributeAction} submitLabel={editing === "new" ? "Create attribute" : "Save"} onSuccess={() => setEditing(null)}>
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <div className="space-y-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={editing === "new" ? "" : editing.name} required autoFocus />
              </Field>
              <Field label="Type" htmlFor="type">
                <Select id="type" name="type" defaultValue={editing === "new" ? "SELECT" : editing.type}>
                  <option value="SELECT">Select (list of values)</option>
                  <option value="COLOR">Colour (values with swatches)</option>
                  <option value="TEXT">Text</option>
                </Select>
              </Field>
              <div className="flex gap-6">
                <Checkbox id="isVariantOption" name="isVariantOption" defaultChecked={editing === "new" ? true : editing.isVariantOption} label="Defines variants (e.g. Size)" />
                <Checkbox id="isFilterable" name="isFilterable" defaultChecked={editing === "new" ? true : editing.isFilterable} label="Show as a filter" />
              </div>
              <Field label="Values" htmlFor="values" hint="One per line. For colours add a hex code: Navy #1f2a44. Values used by existing variants are kept even if removed here.">
                <Textarea id="values" name="values" rows={8} defaultValue={editing === "new" ? "" : editing.values.map((value) => (value.colorHex ? `${value.value} ${value.colorHex}` : value.value)).join("\n")} className="font-mono text-[0.8125rem]" />
              </Field>
            </div>
          </ActionForm>
        )}
      </Dialog>
    </div>
  );
}
