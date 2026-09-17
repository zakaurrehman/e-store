"use client";

import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

type GalleryImage = { id: string; url: string; alt: string; width: number; height: number };

export const GALLERY_SELECT_EVENT = "zendropship:gallery-select";

export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (next: number, smooth = true) => {
      const bounded = (next + images.length) % images.length;
      setIndex(bounded);
      const el = scroller.current;
      if (el) el.scrollTo({ left: bounded * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    },
    [images.length],
  );

  // Variant selection can request a specific image.
  useEffect(() => {
    const handler = (event: Event) => {
      const imageId = (event as CustomEvent<string>).detail;
      const target = images.findIndex((image) => image.id === imageId);
      if (target >= 0) goTo(target);
    };
    window.addEventListener(GALLERY_SELECT_EVENT, handler);
    return () => window.removeEventListener(GALLERY_SELECT_EVENT, handler);
  }, [images, goTo]);

  if (images.length === 0) {
    return <div className="aspect-[4/5] rounded-lg bg-canvas" aria-label={`${productName} — image coming soon`} />;
  }

  return (
    <div className="lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-4">
      {images.length > 1 && (
        <ul className="hidden max-h-[46rem] space-y-3 overflow-y-auto lg:block" aria-label="Product images">
          {images.map((image, thumbIndex) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => goTo(thumbIndex)}
                aria-label={`Show image ${thumbIndex + 1} of ${images.length}`}
                aria-current={thumbIndex === index}
                className={cn("relative block aspect-[4/5] w-full overflow-hidden rounded-sm bg-canvas ring-offset-2 transition", thumbIndex === index ? "ring-1 ring-ink-950" : "opacity-70 hover:opacity-100")}
              >
                <Image src={image.url} alt="" fill sizes="72px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        {/* Mobile & tablet: swipeable scroll-snap carousel. Desktop: single stage with hover zoom. */}
        <div
          ref={scroller}
          className="scrollbar-none -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:mx-0 sm:rounded-lg lg:overflow-hidden"
          onScroll={(event) => {
            const el = event.currentTarget;
            const next = Math.round(el.scrollLeft / el.clientWidth);
            if (next !== index) setIndex(next);
          }}
          aria-roledescription="carousel"
          aria-label={`${productName} images`}
        >
          {images.map((image, slide) => (
            <div key={image.id} className="relative aspect-[4/5] w-full shrink-0 snap-center bg-canvas" aria-roledescription="slide" aria-label={`${slide + 1} of ${images.length}`}>
              <button
                type="button"
                className="group absolute inset-0 block w-full cursor-zoom-in overflow-hidden"
                onClick={() => setLightbox(true)}
                onMouseMove={(event) => {
                  if (window.matchMedia("(hover: none)").matches) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setZoom({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
                }}
                onMouseLeave={() => setZoom(null)}
                aria-label={`Open full-screen image ${slide + 1}`}
              >
                <Image
                  src={image.url}
                  alt={image.alt}
                  fill
                  preload={slide === 0}
                  loading={slide === 0 ? "eager" : "lazy"}
                  quality={90}
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="object-cover transition-transform duration-200 ease-out"
                  style={zoom && slide === index ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5 lg:hidden">
          {images.length > 1 &&
            images.map((image, dot) => <span key={image.id} className={cn("h-1.5 rounded-full transition-all", dot === index ? "w-5 bg-ink-950" : "w-1.5 bg-ink-950/25")} />)}
        </div>
        <button type="button" onClick={() => setLightbox(true)} className="absolute right-3 top-3 hidden size-9 items-center justify-center rounded-full bg-surface/90 text-ink-950 shadow-hairline backdrop-blur hover:bg-surface sm:flex" aria-label="View full screen">
          <Expand className="size-4" />
        </button>
        {images.length > 1 && (
          <div className="absolute bottom-4 right-4 hidden gap-2 lg:flex">
            <button type="button" onClick={() => goTo(index - 1)} className="flex size-10 items-center justify-center rounded-full bg-surface/90 shadow-hairline backdrop-blur hover:bg-surface" aria-label="Previous image">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => goTo(index + 1)} className="flex size-10 items-center justify-center rounded-full bg-surface/90 shadow-hairline backdrop-blur hover:bg-surface" aria-label="Next image">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      <Dialog open={lightbox} onClose={() => setLightbox(false)} title={productName} hideTitle className="m-0 h-dvh max-h-dvh w-screen max-w-none rounded-none bg-surface" bodyClassName="px-0 sm:px-0 pb-0 flex flex-col">
        <div
          className="relative flex-1"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") goTo(index - 1, false);
            if (event.key === "ArrowRight") goTo(index + 1, false);
          }}
        >
          {lightbox && <Image src={images[index].url} alt={images[index].alt} fill quality={90} sizes="100vw" className="object-contain" />}
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => goTo(index - 1, false)} className="absolute left-4 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-surface shadow-pop" aria-label="Previous image">
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={() => goTo(index + 1, false)} className="absolute right-4 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-surface shadow-pop" aria-label="Next image">
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>
        <p className="tabular py-4 text-center text-sm text-ink-500" aria-live="polite">
          {index + 1} / {images.length}
        </p>
      </Dialog>
    </div>
  );
}
