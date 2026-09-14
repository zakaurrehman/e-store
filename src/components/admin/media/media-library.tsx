"use client";

import { Search, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { useMediaLibrary } from "@/components/admin/media/media-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/misc-client";
import { useToast } from "@/components/ui/toast";
import type { MediaItem } from "@/app/api/admin/media/route";

const formatBytes = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

export function MediaLibrary() {
  const library = useMediaLibrary("");
  const [active, setActive] = useState<MediaItem | null>(null);
  const [alt, setAlt] = useState("");
  const [uploadFolder, setUploadFolder] = useState("library");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const open = (item: MediaItem) => {
    setActive(item);
    setAlt(item.alt);
  };

  const saveAlt = async () => {
    if (!active) return;
    setBusy(true);
    const response = await fetch(`/api/admin/media/${active.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alt }) });
    setBusy(false);
    if (!response.ok) return toast({ title: "Couldn't save alt text", tone: "error" });
    toast({ title: "Alt text saved" });
    setActive(null);
    library.reload();
  };

  const remove = async () => {
    if (!active || !window.confirm("Delete this image? This can't be undone.")) return;
    setBusy(true);
    const response = await fetch(`/api/admin/media/${active.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return toast({ title: body.error ?? "Couldn't delete image", tone: "error" });
    toast({ title: "Image deleted" });
    setActive(null);
    library.reload();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input value={library.q} onChange={(event) => { library.setQ(event.target.value); library.setPage(1); }} placeholder="Search by file name or alt text" className="h-10 pl-9" aria-label="Search media" />
        </div>
        <div className="w-44">
          <Select value={library.folder} onChange={(event) => { library.setFolder(event.target.value); library.setPage(1); }} className="h-10" aria-label="Folder">
            <option value="">All folders</option>
            {library.data?.folders.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name} ({entry.count})
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select value={uploadFolder} onChange={(event) => setUploadFolder(event.target.value)} className="h-10 w-36" aria-label="Upload to folder">
            {["library", "products", "banners", "categories", "brands"].map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </Select>
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={async (event) => { if (event.target.files?.length) { const uploaded = await library.upload(event.target.files, uploadFolder); if (uploaded.length) toast({ title: `${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded` }); } event.target.value = ""; }} />
          <Button onClick={() => fileInput.current?.click()} loading={library.loading}>
            <Upload className="size-4" /> Upload
          </Button>
        </div>
      </div>
      {library.error && (
        <Alert tone="danger" className="mt-3">
          {library.error}
        </Alert>
      )}
      <div className="mt-5">
        {!library.data && library.loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner label="Loading media" />
          </div>
        ) : library.data && library.data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong py-20 text-center text-sm text-ink-500">No images here yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {library.data?.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => open(item)} className="group block w-full rounded-md border border-line bg-surface p-2 text-left transition-colors hover:border-ink-950">
                  <span className="relative block aspect-square overflow-hidden rounded-sm bg-canvas">
                    <Image src={item.url} alt={item.alt || item.filename} fill sizes="200px" className="object-cover" />
                  </span>
                  <span className="mt-2 block truncate text-[0.8125rem] font-medium text-ink-900">{item.filename}</span>
                  <span className="block text-[0.6875rem] text-ink-500">
                    {item.width}×{item.height} · {formatBytes(item.sizeBytes)} · {item.folder}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {library.data && library.data.pageCount > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-ink-500">
          <span>
            Page {library.data.page} of {library.data.pageCount} · {library.data.total} images
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={library.page <= 1} onClick={() => library.setPage((page) => page - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={library.page >= library.data.pageCount} onClick={() => library.setPage((page) => page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={!!active}
        onClose={() => setActive(null)}
        title={active?.filename ?? ""}
        className="w-[min(calc(100vw-2rem),48rem)]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={remove} loading={busy}>
              <Trash2 className="size-4" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setActive(null)}>
                Close
              </Button>
              <Button onClick={saveAlt} loading={busy}>
                Save alt text
              </Button>
            </div>
          </div>
        }
      >
        {active && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="relative aspect-square overflow-hidden rounded-md bg-canvas">
              <Image src={active.url} alt={active.alt || active.filename} fill sizes="400px" className="object-contain" />
            </div>
            <div className="space-y-4 text-sm">
              <Field label="Alt text" htmlFor="media-alt" hint="Describes the image for screen readers and search engines.">
                <Input id="media-alt" value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} />
              </Field>
              <dl className="space-y-1.5 text-[0.8125rem] text-ink-600">
                <div className="flex justify-between">
                  <dt>Dimensions</dt>
                  <dd className="tabular">
                    {active.width} × {active.height}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Size</dt>
                  <dd className="tabular">{formatBytes(active.sizeBytes)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Folder</dt>
                  <dd>{active.folder}</dd>
                </div>
                {active.credit && (
                  <div className="flex justify-between gap-4">
                    <dt>Credit</dt>
                    <dd className="text-right">{active.credit}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt>URL</dt>
                  <dd className="truncate">
                    <a href={active.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {active.url}
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
