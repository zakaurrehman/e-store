"use client";

import { Check, Search, Upload } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/misc-client";
import type { MediaItem } from "@/app/api/admin/media/route";
import { cn } from "@/utils/cn";

type LibraryResponse = { items: MediaItem[]; total: number; page: number; pageCount: number; folders: Array<{ name: string; count: number }> };

export function useMediaLibrary(initialFolder = "") {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState(initialFolder);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);

  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/media?q=${encodeURIComponent(q)}&folder=${encodeURIComponent(folder)}&page=${page}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as LibraryResponse;
      if (current === version.current) {
        setData(body);
        setError(null);
      }
    } catch (cause) {
      if (current === version.current) setError(cause instanceof Error ? cause.message : "Failed to load media");
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [q, folder, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, q ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  const upload = useCallback(
    async (files: FileList | File[], uploadFolder: string, alt = "") => {
      const form = new FormData();
      for (const file of Array.from(files)) form.append("files", file);
      form.append("folder", uploadFolder);
      form.append("alt", alt);
      setLoading(true);
      try {
        const response = await fetch("/api/admin/media", { method: "POST", body: form });
        const body = (await response.json()) as { uploaded?: MediaItem[]; errors?: string[]; error?: string };
        if (body.error) setError(body.error);
        else if (body.errors?.length) setError(body.errors.join(" · "));
        else setError(null);
        await load();
        return body.uploaded ?? [];
      } finally {
        setLoading(false);
      }
    },
    [load],
  );

  return { q, setQ, folder, setFolder, page, setPage, data, loading, error, reload: load, upload };
}

export function MediaPicker({ open, onClose, onSelect, multiple = true, folder = "products" }: { open: boolean; onClose: () => void; onSelect: (items: MediaItem[]) => void; multiple?: boolean; folder?: string }) {
  const library = useMediaLibrary("");
  const [selected, setSelected] = useState<Map<string, MediaItem>>(new Map());
  const fileInput = useRef<HTMLInputElement>(null);

  // Each opening starts with an empty selection (adjusted during render) and fresh library contents (effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelected(new Map());
  }
  useEffect(() => {
    if (open) library.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (item: MediaItem) => {
    setSelected((current) => {
      const next = new Map(multiple ? current : []);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Media library"
      className="w-[min(calc(100vw-2rem),64rem)] max-h-[90dvh]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-500">
            {selected.size} selected{library.data ? ` · ${library.data.total} in library` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={selected.size === 0}
              onClick={() => {
                onSelect([...selected.values()]);
                onClose();
              }}
            >
              {multiple ? `Add ${selected.size || ""} image${selected.size === 1 ? "" : "s"}` : "Choose image"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
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
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          className="hidden"
          onChange={async (event) => {
            if (!event.target.files?.length) return;
            const uploaded = await library.upload(event.target.files, folder);
            setSelected((current) => {
              const next = new Map(multiple ? current : []);
              uploaded.forEach((item) => next.set(item.id, item));
              return next;
            });
            event.target.value = "";
          }}
        />
        <Button variant="secondary" onClick={() => fileInput.current?.click()} loading={library.loading}>
          <Upload className="size-4" aria-hidden /> Upload
        </Button>
      </div>
      {library.error && (
        <Alert tone="danger" className="mt-3">
          {library.error}
        </Alert>
      )}
      <div className="mt-4 min-h-[16rem]">
        {!library.data && library.loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner label="Loading media" />
          </div>
        ) : library.data && library.data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-500">No images yet. Upload some to get started.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {library.data?.items.map((item) => {
              const active = selected.has(item.id);
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => toggle(item)} className={cn("group relative block aspect-square w-full overflow-hidden rounded-sm bg-canvas ring-offset-2 transition", active ? "ring-2 ring-ink-950" : "hover:ring-1 hover:ring-line-strong")} aria-pressed={active} title={item.filename}>
                    <Image src={item.url} alt={item.alt || item.filename} fill sizes="160px" className="object-cover" />
                    {active && (
                      <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-ink-950 text-white">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                  <p className="mt-1 truncate text-[0.6875rem] text-ink-500">{item.filename}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {library.data && library.data.pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
          <span>
            Page {library.data.page} of {library.data.pageCount}
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
    </Dialog>
  );
}
