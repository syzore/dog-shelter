"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";

import type { Photo } from "@/lib/types";

type LightboxProps = {
  photos: Photo[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDownload: (photo: Photo) => void | Promise<void>;
};

export default function Lightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  onDownload,
}: LightboxProps) {
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (event.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onClose, onIndexChange]);

  // The parent only mounts the lightbox with a valid index, but guard anyway so
  // a stale index after a delete can't throw.
  if (!photo) return null;

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" aria-hidden />
      </button>

      {hasPrev && (
        <button
          type="button"
          aria-label="Previous photo"
          onClick={(event) => {
            stop(event);
            onIndexChange(index - 1);
          }}
          className="absolute left-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          aria-label="Next photo"
          onClick={(event) => {
            stop(event);
            onIndexChange(index + 1);
          }}
          className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <ChevronRight className="size-6" aria-hidden />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- see PhotoCard */}
      <img
        src={photo.r2_url}
        alt=""
        onClick={stop}
        className="max-h-[88vh] max-w-[88vw] object-contain"
      />

      <div
        onClick={stop}
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur"
      >
        <span className="tabular-nums text-white/70">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              await onDownload(photo);
            } finally {
              setDownloading(false);
            }
          }}
          className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium transition-colors hover:bg-white/25 disabled:opacity-70"
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {downloading ? "Downloading…" : "Download"}
        </button>
      </div>
    </div>
  );
}
