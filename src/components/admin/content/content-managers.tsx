"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { SortableList } from "@/components/admin/catalog/sortable-list";
import { ActionButton, ActionForm } from "@/components/admin/forms";
import { StatusBadge, dateOnly } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { deleteBannerAction, deleteFaqAction, deleteHomeSectionAction, deleteMenuItemAction, reorderFaqAction, reorderHomeSectionsAction, reorderMenuItemsAction, saveBannerAction, saveFaqAction, saveHomeSectionAction, saveMenuItemAction, createMenuAction } from "@/features/admin/content";
import { HOME_SECTION_LABELS, RAIL_SOURCES, TRUST_ICONS, type HomeSectionType } from "@/features/cms/home-sections";
import type { MediaItem } from "@/app/api/admin/media/route";
import { cn } from "@/utils/cn";

// ─── Banners ─────────────────────────────────────────────────────────────────

export type BannerRow = { id: string; placement: "HERO" | "PROMO" | "CATEGORY"; eyebrow: string | null; title: string; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null; theme: string; isActive: boolean; startsAt: string | null; endsAt: string | null; image: { id: string; url: string } | null; mobileImage: { id: string; url: string } | null };

function ImageField({ label, value, onChange, hint }: { label: string; value: { id: string; url: string } | null; onChange: (value: { id: string; url: string } | null) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-800">{label}</p>
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-sm bg-canvas">{value && <Image src={value.url} alt="" fill sizes="128px" className="object-cover" />}</div>
        <div className="flex flex-col gap-1.5">
          <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
            {value ? "Change" : "Choose image"}
          </Button>
          {value && (
            <Button size="xs" variant="ghost" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {hint && <p className="mt-1.5 text-[0.8125rem] text-ink-500">{hint}</p>}
      <MediaPicker open={open} onClose={() => setOpen(false)} multiple={false} folder="banners" onSelect={(items: MediaItem[]) => items[0] && onChange({ id: items[0].id, url: items[0].url })} />
    </div>
  );
}

const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

function BannerForm({ banner, onDone }: { banner: BannerRow | null; onDone: () => void }) {
  const [image, setImage] = useState(banner?.image ?? null);
  const [mobileImage, setMobileImage] = useState(banner?.mobileImage ?? null);
  return (
    <ActionForm action={saveBannerAction} submitLabel={banner ? "Save banner" : "Create banner"} onSuccess={onDone}>
      {banner && <input type="hidden" name="id" value={banner.id} />}
      <input type="hidden" name="imageId" value={image?.id ?? ""} />
      <input type="hidden" name="mobileImageId" value={mobileImage?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Placement" htmlFor="placement">
          <Select id="placement" name="placement" defaultValue={banner?.placement ?? "PROMO"}>
            <option value="HERO">Hero (full-width, top of homepage)</option>
            <option value="PROMO">Promo tile</option>
            <option value="CATEGORY">Editorial / category feature</option>
          </Select>
        </Field>
        <Field label="Text colour" htmlFor="theme" hint="“Light” text sits on dark photos.">
          <Select id="theme" name="theme" defaultValue={banner?.theme ?? "light"}>
            <option value="light">Light text</option>
            <option value="dark">Dark text</option>
          </Select>
        </Field>
        <Field label="Eyebrow" htmlFor="eyebrow" optional>
          <Input id="eyebrow" name="eyebrow" defaultValue={banner?.eyebrow ?? ""} maxLength={60} />
        </Field>
        <Field label="Title" htmlFor="title" hint="Wrap words in _underscores_ for the italic accent, e.g. Made to be _lived in_">
          <Input id="title" name="title" defaultValue={banner?.title ?? ""} required maxLength={120} />
        </Field>
        <Field label="Subtitle" htmlFor="subtitle" optional className="sm:col-span-2">
          <Textarea id="subtitle" name="subtitle" rows={2} defaultValue={banner?.subtitle ?? ""} maxLength={240} />
        </Field>
        <Field label="Button label" htmlFor="ctaLabel" optional>
          <Input id="ctaLabel" name="ctaLabel" defaultValue={banner?.ctaLabel ?? ""} maxLength={40} />
        </Field>
        <Field label="Button link" htmlFor="ctaHref" optional>
          <Input id="ctaHref" name="ctaHref" defaultValue={banner?.ctaHref ?? ""} placeholder="/collections/new-arrivals" />
        </Field>
        <ImageField label="Image" value={image} onChange={setImage} hint="Recommended 2400×1400 for the hero." />
        <ImageField label="Mobile image" value={mobileImage} onChange={setMobileImage} hint="Optional portrait crop for phones." />
        <Field label="Show from" htmlFor="startsAt" optional>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocal(banner?.startsAt ?? null)} />
        </Field>
        <Field label="Show until" htmlFor="endsAt" optional>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocal(banner?.endsAt ?? null)} />
        </Field>
        <Checkbox id="isActive" name="isActive" defaultChecked={banner?.isActive ?? true} label="Active" />
      </div>
    </ActionForm>
  );
}

export function BannersManager({ banners }: { banners: BannerRow[] }) {
  const [editing, setEditing] = useState<BannerRow | null | "new">(null);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New banner
        </Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {banners.length === 0 && <li className="text-sm text-ink-500">No banners yet.</li>}
        {banners.map((banner) => (
          <li key={banner.id} className="overflow-hidden rounded-md border border-line">
            <div className="relative aspect-[16/9] bg-canvas">
              {banner.image && <Image src={banner.image.url} alt="" fill sizes="400px" className="object-cover" />}
              <span className="absolute left-2 top-2 rounded-xs bg-surface/95 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em]">{banner.placement}</span>
              {!banner.isActive && <span className="absolute right-2 top-2 rounded-xs bg-ink-950/80 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-white">Inactive</span>}
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-medium">{banner.title.replaceAll("_", "")}</p>
              <p className="truncate text-[0.75rem] text-ink-500">
                {banner.ctaHref ?? "no link"}
                {banner.startsAt || banner.endsAt ? ` · ${banner.startsAt ? dateOnly.format(new Date(banner.startsAt)) : "now"} → ${banner.endsAt ? dateOnly.format(new Date(banner.endsAt)) : "∞"}` : ""}
              </p>
              <div className="mt-2 flex gap-1">
                <Button size="xs" variant="secondary" onClick={() => setEditing(banner)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <ActionButton size="xs" variant="ghost" action={() => deleteBannerAction(banner.id)} confirm={{ title: "Delete this banner?", destructive: true, confirmLabel: "Delete" }}>
                  <Trash2 className="size-3.5 text-danger" />
                </ActionButton>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New banner" : "Edit banner"} className="w-[min(calc(100vw-2rem),48rem)]">
        {editing && <BannerForm banner={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

// ─── Home sections ───────────────────────────────────────────────────────────

export type SectionRow = { id: string; type: HomeSectionType; title: string | null; subtitle: string | null; isActive: boolean; config: Record<string, unknown> };
type SectionOptions = { banners: Array<{ id: string; title: string; placement: string }>; categories: Array<{ slug: string; name: string }>; brands: Array<{ slug: string; name: string }> };

function summarise(section: SectionRow, options: SectionOptions) {
  const config = section.config as Record<string, unknown>;
  switch (section.type) {
    case "HERO":
    case "EDITORIAL":
      return options.banners.find((banner) => banner.id === config.bannerId)?.title.replaceAll("_", "") ?? "First active banner for the placement";
    case "PRODUCT_RAIL":
      return `${String(config.source ?? "new")}${config.categorySlug ? ` · ${config.categorySlug}` : ""} · ${String(config.limit ?? 8)} products`;
    case "CATEGORY_GRID":
      return (config.categorySlugs as string[] | undefined)?.join(", ") || "All departments";
    case "PROMO_BANNERS":
      return `${(config.bannerIds as string[] | undefined)?.length ?? 0} banner(s)`;
    case "BRAND_STRIP":
      return (config.brandSlugs as string[] | undefined)?.join(", ") || "Featured brands";
    case "TRUST_BAR":
      return `${(config.items as unknown[] | undefined)?.length ?? 0} items`;
    case "REVIEWS":
      return `${String(config.limit ?? 6)} featured reviews`;
    default:
      return "";
  }
}

function SectionForm({ section, options, onDone }: { section: SectionRow | null; options: SectionOptions; onDone: () => void }) {
  const [type, setType] = useState<HomeSectionType>(section?.type ?? "PRODUCT_RAIL");
  const [config, setConfig] = useState<Record<string, unknown>>(section?.config ?? {});
  const set = (key: string, value: unknown) => setConfig((current) => ({ ...current, [key]: value }));
  const list = (key: string) => (config[key] as string[] | undefined) ?? [];
  const toggleList = (key: string, value: string) => set(key, list(key).includes(value) ? list(key).filter((item) => item !== value) : [...list(key), value]);

  const fields = (() => {
    switch (type) {
      case "HERO":
      case "EDITORIAL":
        return (
          <>
            <Field label="Banner" htmlFor="cfg-banner">
              <Select id="cfg-banner" value={String(config.bannerId ?? "")} onChange={(event) => set("bannerId", event.target.value || undefined)}>
                <option value="">First active {type === "HERO" ? "hero" : "category"} banner</option>
                {options.banners.map((banner) => (
                  <option key={banner.id} value={banner.id}>
                    {banner.title.replaceAll("_", "")} ({banner.placement.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            {type === "EDITORIAL" && (
              <Field label="Image side" htmlFor="cfg-align">
                <Select id="cfg-align" value={String(config.align ?? "left")} onChange={(event) => set("align", event.target.value)}>
                  <option value="left">Image left</option>
                  <option value="right">Image right</option>
                </Select>
              </Field>
            )}
          </>
        );
      case "PRODUCT_RAIL":
        return (
          <>
            <Field label="Products" htmlFor="cfg-source">
              <Select id="cfg-source" value={String(config.source ?? "new")} onChange={(event) => set("source", event.target.value)}>
                {RAIL_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Limit to category" htmlFor="cfg-category" optional>
              <Select id="cfg-category" value={String(config.categorySlug ?? "")} onChange={(event) => set("categorySlug", event.target.value || undefined)}>
                <option value="">Whole store</option>
                {options.categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Number of products" htmlFor="cfg-limit">
              <Input id="cfg-limit" type="number" min={4} max={16} value={String(config.limit ?? 8)} onChange={(event) => set("limit", Number(event.target.value))} />
            </Field>
            <Field label="Link label" htmlFor="cfg-cta" optional>
              <Input id="cfg-cta" value={String(config.ctaLabel ?? "")} onChange={(event) => set("ctaLabel", event.target.value || undefined)} />
            </Field>
            <Field label="Link" htmlFor="cfg-cta-href" optional>
              <Input id="cfg-cta-href" value={String(config.ctaHref ?? "")} onChange={(event) => set("ctaHref", event.target.value || undefined)} placeholder="/collections/new-arrivals" />
            </Field>
          </>
        );
      case "CATEGORY_GRID":
        return (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[0.8125rem] font-medium">Categories (empty = all departments)</p>
            <div className="flex flex-wrap gap-1.5">
              {options.categories.map((category) => (
                <button key={category.slug} type="button" aria-pressed={list("categorySlugs").includes(category.slug)} onClick={() => toggleList("categorySlugs", category.slug)} className={cn("rounded-full border px-2.5 py-1 text-[0.75rem]", list("categorySlugs").includes(category.slug) ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong")}>
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        );
      case "PROMO_BANNERS":
        return (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[0.8125rem] font-medium">Banners (up to 2 shown; empty = active promo banners)</p>
            <div className="space-y-1">
              {options.banners.map((banner) => (
                <Checkbox key={banner.id} id={`pb-${banner.id}`} checked={list("bannerIds").includes(banner.id)} onChange={() => toggleList("bannerIds", banner.id)} label={<span className="text-[0.8125rem]">{banner.title.replaceAll("_", "")}</span>} />
              ))}
            </div>
          </div>
        );
      case "BRAND_STRIP":
        return (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[0.8125rem] font-medium">Brands (empty = featured brands)</p>
            <div className="flex flex-wrap gap-1.5">
              {options.brands.map((brand) => (
                <button key={brand.slug} type="button" aria-pressed={list("brandSlugs").includes(brand.slug)} onClick={() => toggleList("brandSlugs", brand.slug)} className={cn("rounded-full border px-2.5 py-1 text-[0.75rem]", list("brandSlugs").includes(brand.slug) ? "border-ink-950 bg-ink-950 text-white" : "border-line-strong")}>
                  {brand.name}
                </button>
              ))}
            </div>
          </div>
        );
      case "TRUST_BAR": {
        const items = (config.items as Array<{ icon: string; title: string; text: string }> | undefined) ?? [];
        return (
          <div className="space-y-2 sm:col-span-2">
            <p className="text-[0.8125rem] font-medium">Items (up to 4)</p>
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[7rem_1fr_1fr_auto] gap-2">
                <Select value={item.icon} onChange={(event) => set("items", items.map((entry, i) => (i === index ? { ...entry, icon: event.target.value } : entry)))} className="h-9" aria-label="Icon">
                  {TRUST_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </Select>
                <Input value={item.title} onChange={(event) => set("items", items.map((entry, i) => (i === index ? { ...entry, title: event.target.value } : entry)))} placeholder="Title" className="h-9" />
                <Input value={item.text} onChange={(event) => set("items", items.map((entry, i) => (i === index ? { ...entry, text: event.target.value } : entry)))} placeholder="Text" className="h-9" />
                <Button size="xs" variant="ghost" onClick={() => set("items", items.filter((_, i) => i !== index))} aria-label="Remove item">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {items.length < 4 && (
              <Button size="xs" variant="secondary" onClick={() => set("items", [...items, { icon: "truck", title: "", text: "" }])}>
                <Plus className="size-3.5" /> Add item
              </Button>
            )}
          </div>
        );
      }
      case "REVIEWS":
        return (
          <Field label="Number of reviews" htmlFor="cfg-reviews">
            <Input id="cfg-reviews" type="number" min={3} max={12} value={String(config.limit ?? 6)} onChange={(event) => set("limit", Number(event.target.value))} />
          </Field>
        );
      case "NEWSLETTER":
        return (
          <Field label="Supporting text" htmlFor="cfg-text" optional className="sm:col-span-2">
            <Input id="cfg-text" value={String(config.text ?? "")} onChange={(event) => set("text", event.target.value || undefined)} />
          </Field>
        );
      default:
        return null;
    }
  })();

  return (
    <ActionForm action={saveHomeSectionAction} submitLabel={section ? "Save section" : "Add section"} onSuccess={onDone}>
      {section && <input type="hidden" name="id" value={section.id} />}
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Section type" htmlFor="type" className="sm:col-span-2">
          <Select id="type" name="type" value={type} onChange={(event) => { setType(event.target.value as HomeSectionType); setConfig({}); }} disabled={!!section}>
            {Object.entries(HOME_SECTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {section && <input type="hidden" name="type" value={type} />}
        </Field>
        <Field label="Title" htmlFor="title" optional hint="Wrap words in _underscores_ for the italic accent.">
          <Input id="title" name="title" defaultValue={section?.title ?? ""} maxLength={120} />
        </Field>
        <Field label="Subtitle" htmlFor="subtitle" optional>
          <Input id="subtitle" name="subtitle" defaultValue={section?.subtitle ?? ""} maxLength={240} />
        </Field>
        {fields}
        <Checkbox id="isActive" name="isActive" defaultChecked={section?.isActive ?? true} label="Visible on the homepage" />
      </div>
    </ActionForm>
  );
}

export function HomeSectionsManager({ sections, options }: { sections: SectionRow[]; options: SectionOptions }) {
  const [editing, setEditing] = useState<SectionRow | null | "new">(null);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add section
        </Button>
      </div>
      <SortableList
        items={sections}
        onReorder={reorderHomeSectionsAction}
        className="divide-y divide-line rounded-md border border-line"
        rowClassName="px-2"
        render={(section) => (
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <span className={cn("text-sm font-medium", !section.isActive && "line-through opacity-60")}>{section.title?.replaceAll("_", "") || HOME_SECTION_LABELS[section.type]}</span>
              <span className="ml-2 text-[0.75rem] text-ink-500">
                {HOME_SECTION_LABELS[section.type]}
                {summarise(section, options) && ` · ${summarise(section, options)}`}
              </span>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="xs" variant="ghost" onClick={() => setEditing(section)} aria-label="Edit section">
                <Pencil className="size-3.5" />
              </Button>
              <ActionButton size="xs" variant="ghost" action={() => deleteHomeSectionAction(section.id)} confirm={{ title: "Remove this section from the homepage?", destructive: true, confirmLabel: "Remove" }}>
                <Trash2 className="size-3.5 text-danger" />
              </ActionButton>
            </div>
          </div>
        )}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add homepage section" : "Edit section"} className="w-[min(calc(100vw-2rem),44rem)]">
        {editing && <SectionForm section={editing === "new" ? null : editing} options={options} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

export type FaqRow = { id: string; group: string; question: string; answer: string; isPublished: boolean };

export function FaqManager({ items, groups }: { items: FaqRow[]; groups: string[] }) {
  const [editing, setEditing] = useState<FaqRow | null | "new">(null);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add question
        </Button>
      </div>
      <SortableList
        items={items}
        onReorder={reorderFaqAction}
        className="divide-y divide-line rounded-md border border-line"
        rowClassName="px-2"
        render={(item) => (
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <span className="mr-2 rounded-xs bg-canvas px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-600">{item.group}</span>
              <span className={cn("text-sm", !item.isPublished && "line-through opacity-60")}>{item.question}</span>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="xs" variant="ghost" onClick={() => setEditing(item)} aria-label="Edit question">
                <Pencil className="size-3.5" />
              </Button>
              <ActionButton size="xs" variant="ghost" action={() => deleteFaqAction(item.id)} confirm={{ title: "Delete this question?", destructive: true, confirmLabel: "Delete" }}>
                <Trash2 className="size-3.5 text-danger" />
              </ActionButton>
            </div>
          </div>
        )}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add question" : "Edit question"}>
        {editing && (
          <ActionForm action={saveFaqAction} submitLabel="Save" onSuccess={() => setEditing(null)}>
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <div className="space-y-4">
              <Field label="Group" htmlFor="group" hint={`Existing: ${groups.join(", ") || "none"}`}>
                <Input id="group" name="group" list="faq-groups" defaultValue={editing === "new" ? groups[0] ?? "" : editing.group} required />
                <datalist id="faq-groups">
                  {groups.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              </Field>
              <Field label="Question" htmlFor="question">
                <Input id="question" name="question" defaultValue={editing === "new" ? "" : editing.question} required maxLength={200} />
              </Field>
              <Field label="Answer" htmlFor="answer">
                <Textarea id="answer" name="answer" rows={5} defaultValue={editing === "new" ? "" : editing.answer} required maxLength={2000} />
              </Field>
              <Checkbox id="isPublished" name="isPublished" defaultChecked={editing === "new" ? true : editing.isPublished} label="Published" />
            </div>
          </ActionForm>
        )}
      </Dialog>
    </div>
  );
}

// ─── Menus ───────────────────────────────────────────────────────────────────

export type MenuRow = { id: string; key: string; name: string; items: Array<{ id: string; label: string; href: string; isActive: boolean }> };

export function MenusManager({ menus }: { menus: MenuRow[] }) {
  const [editing, setEditing] = useState<{ menuId: string; item: MenuRow["items"][number] | null } | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-6">
      <p className="text-[0.8125rem] text-ink-500">Footer columns read the menus <code>footer-help</code>, <code>footer-company</code> and <code>footer-legal</code>. The header navigation is generated from active categories.</p>
      {menus.map((menu) => (
        <div key={menu.id}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {menu.name} <span className="font-normal text-ink-500">· {menu.key}</span>
            </h3>
            <Button size="xs" variant="secondary" onClick={() => setEditing({ menuId: menu.id, item: null })}>
              <Plus className="size-3.5" /> Add link
            </Button>
          </div>
          {menu.items.length === 0 ? (
            <p className="rounded-md border border-dashed border-line p-4 text-center text-[0.8125rem] text-ink-500">No links yet.</p>
          ) : (
            <SortableList
              items={menu.items}
              onReorder={(ids) => reorderMenuItemsAction(menu.id, ids)}
              className="divide-y divide-line rounded-md border border-line"
              rowClassName="px-2"
              render={(item) => (
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0 text-sm">
                    <span className={cn(!item.isActive && "line-through opacity-60")}>{item.label}</span> <span className="text-[0.75rem] text-ink-500">{item.href}</span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setEditing({ menuId: menu.id, item })} aria-label="Edit link">
                      <Pencil className="size-3.5" />
                    </Button>
                    <ActionButton size="xs" variant="ghost" action={() => deleteMenuItemAction(item.id)} confirm={{ title: `Remove “${item.label}”?`, destructive: true, confirmLabel: "Remove" }}>
                      <Trash2 className="size-3.5 text-danger" />
                    </ActionButton>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
        <Plus className="size-4" /> New menu
      </Button>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.item ? "Edit link" : "Add link"}>
        {editing && (
          <ActionForm action={saveMenuItemAction} submitLabel="Save" onSuccess={() => setEditing(null)}>
            <input type="hidden" name="menuId" value={editing.menuId} />
            {editing.item && <input type="hidden" name="id" value={editing.item.id} />}
            <div className="space-y-4">
              <Field label="Label" htmlFor="label">
                <Input id="label" name="label" defaultValue={editing.item?.label ?? ""} required maxLength={60} />
              </Field>
              <Field label="Link" htmlFor="href" hint="Internal path (/pages/returns) or full https:// URL">
                <Input id="href" name="href" defaultValue={editing.item?.href ?? ""} required />
              </Field>
              <Checkbox id="isActive" name="isActive" defaultChecked={editing.item?.isActive ?? true} label="Visible" />
            </div>
          </ActionForm>
        )}
      </Dialog>
      <Dialog open={creating} onClose={() => setCreating(false)} title="New menu">
        <ActionForm action={createMenuAction} submitLabel="Create menu" onSuccess={() => setCreating(false)}>
          <Field label="Name" htmlFor="menu-name" hint="The key is generated from the name (e.g. “Footer Social” → footer-social).">
            <Input id="menu-name" name="name" required maxLength={60} />
          </Field>
        </ActionForm>
      </Dialog>
    </div>
  );
}

export function PageStatus({ status }: { status: string }) {
  return <StatusBadge label={status === "PUBLISHED" ? "Published" : "Draft"} tone={status === "PUBLISHED" ? "success" : "neutral"} />;
}
