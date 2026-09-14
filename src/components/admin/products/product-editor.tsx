"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, Plus, Star, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc-client";
import { useToast } from "@/components/ui/toast";
import { saveProductAction } from "@/features/admin/products/actions";
import type { EditorOptions, EditorProduct, EditorVariant } from "@/features/admin/products/queries";
import type { MediaItem } from "@/app/api/admin/media/route";
import { cn } from "@/utils/cn";
import { slugify } from "@/utils/slug";

type ImageEntry = { mediaId: string; url: string; alt: string };

const emptyVariant = (): EditorVariant => ({ id: undefined as unknown as string, sku: "", barcode: "", price: "", salePrice: "", cost: "", stockQuantity: 0, lowStockThreshold: 5, trackInventory: true, allowBackorder: false, weightGrams: "", lengthMm: "", widthMm: "", heightMm: "", imageMediaId: null, optionValueIds: [], isActive: true });

const emptyProduct = (): EditorProduct => ({
  id: "",
  name: "",
  slug: "",
  status: "DRAFT",
  brandId: null,
  primaryCategoryId: null,
  categoryIds: [],
  collectionIds: [],
  tags: [],
  shortDescription: "",
  description: "",
  isFeatured: false,
  specifications: [],
  careInstructions: "",
  shippingNote: "",
  seoTitle: "",
  seoDescription: "",
  images: [],
  attributeValueIds: [],
  variants: [emptyVariant()],
  salesCount: 0,
  ratingAverage: 0,
  ratingCount: 0,
});

function SectionCard({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
          {description && <p className="text-[0.8125rem] text-ink-500">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

function SortableImage({ image, index, onRemove, onAlt }: { image: ImageEntry; index: number; onRemove: () => void; onAlt: (alt: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.mediaId });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("relative rounded-md border border-line bg-surface p-2", isDragging && "z-10 shadow-pop")}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-canvas">
        <Image src={image.url} alt={image.alt} fill sizes="200px" className="object-cover" />
        {index === 0 && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-xs bg-ink-950 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-white">
            <Star className="size-3" /> Main
          </span>
        )}
        <button type="button" {...attributes} {...listeners} className="absolute right-1.5 top-1.5 flex size-7 cursor-grab items-center justify-center rounded-sm bg-surface/90 text-ink-700 shadow-hairline active:cursor-grabbing" aria-label={`Reorder image ${index + 1}`}>
          <GripVertical className="size-4" />
        </button>
      </div>
      <input value={image.alt} onChange={(event) => onAlt(event.target.value)} placeholder="Alt text" className="mt-2 h-8 w-full rounded-xs border border-line px-2 text-[0.75rem] outline-none focus:border-ink-950" aria-label={`Alt text for image ${index + 1}`} />
      <button type="button" onClick={onRemove} className="mt-1 inline-flex items-center gap-1 text-[0.75rem] text-ink-500 hover:text-danger">
        <Trash2 className="size-3" /> Remove
      </button>
    </li>
  );
}

function cartesian(groups: string[][]): string[][] {
  return groups.reduce<string[][]>((acc, group) => acc.flatMap((combo) => group.map((value) => [...combo, value])), [[]]);
}

export function ProductEditor({ product, options, canDelete }: { product: EditorProduct | null; options: EditorOptions; canDelete: boolean }) {
  const isNew = !product;
  const [form, setForm] = useState<EditorProduct>(product ?? emptyProduct());
  const galleryDndId = useId();
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [tagInput, setTagInput] = useState(product?.tags.join(", ") ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [variantImageFor, setVariantImageFor] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const variantAttributes = options.attributes.filter((attribute) => attribute.isVariantOption);
  const factAttributes = options.attributes.filter((attribute) => !attribute.isVariantOption);
  const valueToAttribute = useMemo(() => new Map(options.attributes.flatMap((attribute) => attribute.values.map((value) => [value.id, attribute.id] as const))), [options.attributes]);
  const valueLabel = useMemo(() => new Map(options.attributes.flatMap((attribute) => attribute.values.map((value) => [value.id, value.value] as const))), [options.attributes]);

  // Option groups currently in use: attributeId → selected value ids (derived from variants).
  const optionGroups = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const variant of form.variants) for (const valueId of variant.optionValueIds) {
      const attributeId = valueToAttribute.get(valueId);
      if (!attributeId) continue;
      if (!groups.has(attributeId)) groups.set(attributeId, new Set());
      groups.get(attributeId)!.add(valueId);
    }
    return groups;
  }, [form.variants, valueToAttribute]);
  const [draftGroups, setDraftGroups] = useState<Map<string, Set<string>>>(() => new Map(optionGroups));
  const hasOptions = draftGroups.size > 0;

  const update = <K extends keyof EditorProduct>(key: K, value: EditorProduct[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateVariant = (index: number, patch: Partial<EditorVariant>) => setForm((current) => ({ ...current, variants: current.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)) }));

  /** Rebuilds the variant matrix from the option groups, keeping data for combinations that already exist. */
  const applyOptionGroups = (groups: Map<string, Set<string>>) => {
    setDraftGroups(groups);
    const orderedGroups = variantAttributes.filter((attribute) => groups.has(attribute.id) && groups.get(attribute.id)!.size > 0).map((attribute) => attribute.values.filter((value) => groups.get(attribute.id)!.has(value.id)).map((value) => value.id));
    if (orderedGroups.length === 0) {
      setForm((current) => ({ ...current, variants: [{ ...(current.variants[0] ?? emptyVariant()), optionValueIds: [] }] }));
      return;
    }
    const combos = cartesian(orderedGroups);
    setForm((current) => {
      const template = current.variants[0] ?? emptyVariant();
      const existing = new Map(current.variants.map((variant) => [[...variant.optionValueIds].sort().join("|"), variant]));
      return {
        ...current,
        variants: combos.map((combo) => {
          const key = [...combo].sort().join("|");
          const match = existing.get(key);
          return match ? { ...match, optionValueIds: combo } : { ...emptyVariant(), price: template.price, salePrice: template.salePrice, cost: template.cost, lowStockThreshold: template.lowStockThreshold, trackInventory: template.trackInventory, allowBackorder: template.allowBackorder, weightGrams: template.weightGrams, optionValueIds: combo };
        }),
      };
    });
  };

  const submit = () => {
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const payload = {
        ...form,
        slug: form.slug || undefined,
        tags: tagInput.split(",").map((tag) => tag.trim()).filter(Boolean),
        images: form.images.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
        variants: form.variants.map((variant) => ({ ...variant, id: variant.id || undefined })),
      };
      const result = await saveProductAction(isNew ? null : form.id, payload);
      if (result.status === "error") {
        setFormError(result.message);
        setErrors(result.fieldErrors ?? {});
        toast({ title: result.message, tone: "error" });
        return;
      }
      if (result.status === "success" && result.data) {
        toast({ title: result.message ?? "Saved" });
        if (isNew) router.push(`/admin/products/${result.data.id}`);
        else router.refresh();
      }
    });
  };

  const variantTitle = (variant: EditorVariant) => variant.optionValueIds.map((id) => valueLabel.get(id) ?? "?").join(" / ") || "Default";

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <SectionCard title="General">
          <Field label="Name" htmlFor="p-name" error={errors.name}>
            <Input
              id="p-name"
              value={form.name}
              onChange={(event) => {
                update("name", event.target.value);
                if (!slugTouched) update("slug", slugify(event.target.value));
              }}
            />
          </Field>
          <Field label="URL slug" htmlFor="p-slug" hint={`/p/${form.slug || "…"}`} error={errors.slug}>
            <Input
              id="p-slug"
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                update("slug", event.target.value);
              }}
              onBlur={() => update("slug", slugify(form.slug || form.name))}
            />
          </Field>
          <Field label="Short description" htmlFor="p-short" hint="Shown under the title and used as the default meta description." error={errors.shortDescription}>
            <Textarea id="p-short" rows={2} maxLength={300} value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} />
          </Field>
          <Field label="Description" htmlFor="p-desc" hint="Markdown supported: **bold**, lists, headings." error={errors.description}>
            <Textarea id="p-desc" rows={10} value={form.description} onChange={(event) => update("description", event.target.value)} className="font-mono text-[0.8125rem]" />
          </Field>
        </SectionCard>

        <SectionCard
          title="Media"
          description="Drag to reorder. The first image is the main image."
          actions={
            <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
              <ImagePlus className="size-4" /> Add images
            </Button>
          }
        >
          {form.images.length === 0 ? (
            <button type="button" onClick={() => setPickerOpen(true)} className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-sm text-ink-600 hover:border-ink-950 hover:text-ink-950">
              <ImagePlus className="size-5" /> Upload or choose from the media library
            </button>
          ) : (
            <DndContext
              id={galleryDndId}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event: DragEndEvent) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const from = form.images.findIndex((image) => image.mediaId === active.id);
                const to = form.images.findIndex((image) => image.mediaId === over.id);
                update("images", arrayMove(form.images, from, to));
              }}
            >
              <SortableContext items={form.images.map((image) => image.mediaId)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {form.images.map((image, index) => (
                    <SortableImage key={image.mediaId} image={image} index={index} onRemove={() => update("images", form.images.filter((entry) => entry.mediaId !== image.mediaId))} onAlt={(alt) => update("images", form.images.map((entry) => (entry.mediaId === image.mediaId ? { ...entry, alt } : entry)))} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </SectionCard>

        <SectionCard title="Options & variants" description="Choose option values (e.g. sizes) to generate purchasable variants. Leave empty for a single-variant product.">
          <div className="grid gap-4 md:grid-cols-2">
            {variantAttributes.map((attribute) => {
              const selected = draftGroups.get(attribute.id) ?? new Set<string>();
              return (
                <fieldset key={attribute.id} className="rounded-md border border-line p-3">
                  <legend className="px-1 text-[0.8125rem] font-medium">{attribute.name}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {attribute.values.map((value) => {
                      const active = selected.has(value.id);
                      return (
                        <button
                          key={value.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            const next = new Map(draftGroups);
                            const set = new Set(next.get(attribute.id) ?? []);
                            if (set.has(value.id)) set.delete(value.id);
                            else set.add(value.id);
                            if (set.size) next.set(attribute.id, set);
                            else next.delete(attribute.id);
                            applyOptionGroups(next);
                          }}
                          className={cn("rounded-sm border px-2.5 py-1 text-[0.8125rem] transition-colors", active ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong hover:border-ink-950")}
                        >
                          {value.value}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
          {errors.variants && <p className="text-sm text-danger">{errors.variants[0]}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-[0.8125rem]">
              <thead>
                <tr className="text-left text-2xs font-semibold uppercase tracking-[0.1em] text-ink-500">
                  <th className="pb-2 pr-3">Variant</th>
                  <th className="pb-2 pr-3">SKU</th>
                  <th className="pb-2 pr-3">Price</th>
                  <th className="pb-2 pr-3">Sale price</th>
                  <th className="pb-2 pr-3">Cost</th>
                  <th className="pb-2 pr-3">Stock</th>
                  <th className="pb-2 pr-3">Low at</th>
                  <th className="pb-2 pr-3">Weight g</th>
                  <th className="pb-2 pr-3">Image</th>
                  <th className="pb-2">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {form.variants.map((variant, index) => (
                  <tr key={variant.id ?? `new-${index}`} className={cn(!variant.isActive && "opacity-50")}>
                    <td className="py-2 pr-3 font-medium">{hasOptions ? variantTitle(variant) : "Default"}</td>
                    <td className="py-2 pr-3">
                      <Input value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.target.value })} className="h-9 w-32 font-mono text-[0.75rem]" aria-label="SKU" />
                    </td>
                    <td className="py-2 pr-3">
                      <Input value={variant.price} inputMode="decimal" onChange={(event) => updateVariant(index, { price: event.target.value })} className={cn("h-9 w-24", errors[`variants.${index}.priceCents`] && "border-danger")} aria-label="Price" />
                    </td>
                    <td className="py-2 pr-3">
                      <Input value={variant.salePrice} inputMode="decimal" onChange={(event) => updateVariant(index, { salePrice: event.target.value })} className={cn("h-9 w-24", errors[`variants.${index}.salePriceCents`] && "border-danger")} aria-label="Sale price" placeholder="—" />
                    </td>
                    <td className="py-2 pr-3">
                      <Input value={variant.cost} inputMode="decimal" onChange={(event) => updateVariant(index, { cost: event.target.value })} className="h-9 w-24" aria-label="Cost" placeholder="—" />
                    </td>
                    <td className="py-2 pr-3">
                      <Input type="number" value={variant.stockQuantity} onChange={(event) => updateVariant(index, { stockQuantity: Number(event.target.value) })} className="h-9 w-20" aria-label="Stock" disabled={!variant.trackInventory} />
                    </td>
                    <td className="py-2 pr-3">
                      <Input type="number" value={variant.lowStockThreshold} onChange={(event) => updateVariant(index, { lowStockThreshold: Number(event.target.value) })} className="h-9 w-16" aria-label="Low stock threshold" />
                    </td>
                    <td className="py-2 pr-3">
                      <Input type="number" value={variant.weightGrams} onChange={(event) => updateVariant(index, { weightGrams: event.target.value === "" ? "" : Number(event.target.value) })} className="h-9 w-20" aria-label="Weight in grams" placeholder="—" />
                    </td>
                    <td className="py-2 pr-3">
                      <button type="button" onClick={() => setVariantImageFor(index)} className="relative flex size-9 items-center justify-center overflow-hidden rounded-sm border border-line-strong bg-canvas" aria-label="Choose variant image">
                        {variant.imageMediaId && form.images.find((image) => image.mediaId === variant.imageMediaId) ? <Image src={form.images.find((image) => image.mediaId === variant.imageMediaId)!.url} alt="" fill sizes="36px" className="object-cover" /> : <ImagePlus className="size-4 text-ink-400" />}
                      </button>
                    </td>
                    <td className="py-2">
                      <Checkbox checked={variant.isActive} onChange={(event) => updateVariant(index, { isActive: event.target.checked })} aria-label="Variant active" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-6 text-[0.8125rem]">
            <Checkbox id="track-inv" checked={form.variants.every((variant) => variant.trackInventory)} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((variant) => ({ ...variant, trackInventory: event.target.checked })) }))} label="Track inventory" />
            <Checkbox id="backorder" checked={form.variants.every((variant) => variant.allowBackorder)} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((variant) => ({ ...variant, allowBackorder: event.target.checked })) }))} label="Allow backorders when sold out" />
          </div>
          {variantImageFor !== null && (
            <div className="rounded-md border border-line bg-canvas p-3">
              <p className="mb-2 text-[0.8125rem] text-ink-600">Choose an image for {variantTitle(form.variants[variantImageFor])}:</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { updateVariant(variantImageFor, { imageMediaId: null }); setVariantImageFor(null); }} className="flex size-14 items-center justify-center rounded-sm border border-line-strong text-xs text-ink-500">
                  None
                </button>
                {form.images.map((image) => (
                  <button key={image.mediaId} type="button" onClick={() => { updateVariant(variantImageFor, { imageMediaId: image.mediaId }); setVariantImageFor(null); }} className="relative size-14 overflow-hidden rounded-sm border border-line-strong hover:border-ink-950">
                    <Image src={image.url} alt={image.alt} fill sizes="56px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Details" description="Specifications and care shown on the product page.">
          <div>
            <p className="mb-2 text-[0.8125rem] font-medium text-ink-800">Specifications</p>
            <div className="space-y-2">
              {form.specifications.map((row, index) => (
                <div key={index} className="flex gap-2">
                  <Input value={row.label} placeholder="Label (e.g. Material)" onChange={(event) => update("specifications", form.specifications.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))} className="h-9 w-48" aria-label="Specification label" />
                  <Input value={row.value} placeholder="Value" onChange={(event) => update("specifications", form.specifications.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)))} className="h-9 flex-1" aria-label="Specification value" />
                  <button type="button" onClick={() => update("specifications", form.specifications.filter((_, i) => i !== index))} className="text-ink-400 hover:text-danger" aria-label="Remove specification">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <Button size="xs" variant="secondary" onClick={() => update("specifications", [...form.specifications, { label: "", value: "" }])}>
                <Plus className="size-3.5" /> Add row
              </Button>
            </div>
          </div>
          <Field label="Care instructions" htmlFor="p-care" optional>
            <Textarea id="p-care" rows={2} value={form.careInstructions} onChange={(event) => update("careInstructions", event.target.value)} />
          </Field>
          <Field label="Shipping note" htmlFor="p-ship" optional hint="Shown in the Shipping & returns section, e.g. “Ships separately via freight”.">
            <Input id="p-ship" value={form.shippingNote} onChange={(event) => update("shippingNote", event.target.value)} />
          </Field>
        </SectionCard>

        <SectionCard title="Search engine listing">
          <Field label="SEO title" htmlFor="p-seo-title" hint={`${form.seoTitle.length}/70 · defaults to the product name`} optional>
            <Input id="p-seo-title" maxLength={120} value={form.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} />
          </Field>
          <Field label="Meta description" htmlFor="p-seo-desc" hint={`${form.seoDescription.length}/160 · defaults to the short description`} optional>
            <Textarea id="p-seo-desc" rows={2} maxLength={320} value={form.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} />
          </Field>
          <div className="rounded-md bg-canvas p-4">
            <p className="text-[0.75rem] text-ink-500">Preview</p>
            <p className="mt-1 text-[1.0625rem] text-[#1a0dab]">{(form.seoTitle || form.name || "Product title").slice(0, 70)} · Veyora</p>
            <p className="text-[0.8125rem] text-success">veyora.com › p › {form.slug || "slug"}</p>
            <p className="mt-1 text-[0.875rem] text-ink-700">{(form.seoDescription || form.shortDescription || "Meta description").slice(0, 160)}</p>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-6 xl:col-span-4">
        <SectionCard title="Status">
          <Field label="Visibility" htmlFor="p-status">
            <Select id="p-status" value={form.status} onChange={(event) => update("status", event.target.value as EditorProduct["status"])}>
              <option value="DRAFT">Draft — hidden from the store</option>
              <option value="ACTIVE">Active — visible and purchasable</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Checkbox id="p-featured" checked={form.isFeatured} onChange={(event) => update("isFeatured", event.target.checked)} label="Featured (Editors’ picks & homepage)" />
          {!isNew && (
            <p className="text-[0.8125rem] text-ink-500">
              {form.salesCount} sold · {form.ratingCount ? `${form.ratingAverage.toFixed(1)}★ (${form.ratingCount})` : "no reviews yet"} ·{" "}
              <Link href={`/p/${form.slug}`} target="_blank" className="underline underline-offset-2">
                View on store
              </Link>
            </p>
          )}
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Button onClick={submit} loading={pending} fullWidth>
              {isNew ? "Create product" : "Save changes"}
            </Button>
            {!isNew && canDelete && (
              <Link href={`/admin/products/${form.id}?confirmDelete=1`} className="text-center text-[0.8125rem] text-danger underline-offset-4 hover:underline">
                Delete product
              </Link>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Organisation">
          <Field label="Brand" htmlFor="p-brand">
            <Select id="p-brand" value={form.brandId ?? ""} onChange={(event) => update("brandId", event.target.value || null)}>
              <option value="">No brand</option>
              {options.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Primary category" htmlFor="p-primary" hint="Used for breadcrumbs and analytics.">
            <Select
              id="p-primary"
              value={form.primaryCategoryId ?? ""}
              onChange={(event) => {
                const id = event.target.value || null;
                setForm((current) => ({ ...current, primaryCategoryId: id, categoryIds: id && !current.categoryIds.includes(id) ? [...current.categoryIds, id] : current.categoryIds }));
              }}
            >
              <option value="">Choose…</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentName ? `${category.parentName} › ` : ""}
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">Also list in</p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-sm border border-line p-2">
              {options.categories.map((category) => (
                <Checkbox
                  key={category.id}
                  id={`cat-${category.id}`}
                  checked={form.categoryIds.includes(category.id)}
                  onChange={(event) => update("categoryIds", event.target.checked ? [...form.categoryIds, category.id] : form.categoryIds.filter((id) => id !== category.id))}
                  label={
                    <span className={cn("text-[0.8125rem]", category.parentId ? "text-ink-700" : "font-medium")}>
                      {category.parentName ? `${category.parentName} › ` : ""}
                      {category.name}
                    </span>
                  }
                />
              ))}
            </div>
          </div>
          {options.collections.length > 0 && (
            <div>
              <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">Collections</p>
              <div className="space-y-1">
                {options.collections.map((collection) => (
                  <Checkbox key={collection.id} id={`col-${collection.id}`} checked={form.collectionIds.includes(collection.id)} onChange={(event) => update("collectionIds", event.target.checked ? [...form.collectionIds, collection.id] : form.collectionIds.filter((id) => id !== collection.id))} label={<span className="text-[0.8125rem]">{collection.name}</span>} />
                ))}
              </div>
            </div>
          )}
          <Field label="Tags" htmlFor="p-tags" hint="Comma separated" optional>
            <Input id="p-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="summer, gift, new" />
          </Field>
        </SectionCard>

        {factAttributes.length > 0 && (
          <SectionCard title="Filter attributes" description="Facts customers can filter by (colour, material…).">
            {factAttributes.map((attribute) => (
              <div key={attribute.id}>
                <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">{attribute.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {attribute.values.map((value) => {
                    const active = form.attributeValueIds.includes(value.id);
                    return (
                      <button
                        key={value.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => update("attributeValueIds", active ? form.attributeValueIds.filter((id) => id !== value.id) : [...form.attributeValueIds, value.id])}
                        className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors", active ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong hover:border-ink-950")}
                      >
                        {value.colorHex && <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: value.colorHex }} />}
                        {value.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </SectionCard>
        )}
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(items: MediaItem[]) => {
          const existing = new Set(form.images.map((image) => image.mediaId));
          update("images", [...form.images, ...items.filter((item) => !existing.has(item.id)).map((item) => ({ mediaId: item.id, url: item.url, alt: item.alt || form.name, width: item.width, height: item.height }))]);
        }}
      />
    </div>
  );
}
