"use client";

import { useEffect, useRef, useState } from "react";

import { Check, Download, Loader2, Maximize2, Sparkles } from "lucide-react";

import { thumbUrlFor } from "@/lib/imageTypes";
import type { Photo } from "@/lib/types";

type PhotoCardProps = {
  photo: Photo;
  isSelected: boolean;
  onToggleSelect: (photo: Photo, additive: boolean) => void;
  onToggleUsed: (photo: Photo) => void;
  onBurstSelect: (photo: Photo) => void;
  onRangeSelect: (photo: Photo) => void;
  onOpenFullscreen: (photo: Photo) => void;
  onDownload: (photo: Photo) => void | Promise<void>;
  onDragStart: (photo: Photo, event: React.DragEvent) => void;
  onDragEnd: () => void;
};

const LONG_PRESS_MS = 400;

export default function PhotoCard({
  photo,
  isSelected,
  onToggleSelect,
  onToggleUsed,
  onBurstSelect,
  onRangeSelect,
  onOpenFullscreen,
  onDownload,
  onDragStart,
  onDragEnd,
}: PhotoCardProps) {
  // Refs, not state: these track an in-flight gesture and must survive renders
  // without causing one.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    };
  }, []);

  const startPress = () => {
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onBurstSelect(photo);
    }, LONG_PRESS_MS);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const handleClick = (event: React.MouseEvent) => {
    // A long-press already resolved this interaction as a burst select.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    // Shift+click selects the range from the anchor to here; burst grouping
    // now lives on long-press only.
    if (event.shiftKey) {
      onRangeSelect(photo);
      return;
    }
    onToggleSelect(photo, event.metaKey || event.ctrlKey);
  };

  return (
    <figure
      draggable
      onDragStart={(event) => {
        // Firefox refuses to start a drag unless some data is set, and the
        // effect must be declared for the drop target's cursor to be right.
        event.dataTransfer.setData("text/plain", photo.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart(photo, event);
      }}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      className={`group relative cursor-pointer overflow-hidden rounded-md border bg-surface transition-all select-none ${
        isSelected
          ? "border-accent ring-2 ring-accent"
          : "border-border hover:border-muted"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- R2 serves these
          directly from a public custom domain; next/image would proxy them
          through Vercel's optimizer for no benefit and real cost. */}
      <img
        src={thumbUrlFor(photo.r2_url)}
        alt=""
        draggable={false}
        loading="lazy"
        onError={(event) => {
          // No thumbnail (older upload, or a format we couldn't downscale):
          // fall back to the full image, once.
          const img = event.currentTarget;
          if (img.src !== photo.r2_url) img.src = photo.r2_url;
        }}
        className={`block w-full transition-[filter,opacity] ${
          photo.is_used ? "opacity-40 grayscale" : ""
        }`}
      />

      {photo.is_used && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/65 px-1.5 py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-white/85">
          Used
        </span>
      )}

      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={isSelected ? "Deselect photo" : "Select photo"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect(photo, true);
        }}
        className={`absolute left-1.5 top-1.5 grid size-5 place-items-center rounded border transition-opacity ${
          isSelected
            ? "border-accent bg-accent text-white"
            : "border-white/60 bg-black/40 text-transparent opacity-0 group-hover:opacity-100"
        }`}
      >
        <Check className="size-3.5" aria-hidden />
      </button>

      <button
        type="button"
        aria-pressed={photo.is_used}
        aria-label={photo.is_used ? "Mark as unused" : "Mark as used"}
        title={photo.is_used ? "Mark as unused" : "Mark as used"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleUsed(photo);
        }}
        className={`absolute right-1.5 top-1.5 grid size-5 place-items-center rounded border border-white/25 transition-opacity ${
          photo.is_used
            ? "bg-amber-400/90 text-black"
            : "bg-black/40 text-white/80 opacity-0 group-hover:opacity-100"
        }`}
      >
        <Sparkles className="size-3" aria-hidden />
      </button>

      <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Open full screen"
          title="Open full screen"
          onClick={(event) => {
            event.stopPropagation();
            onOpenFullscreen(photo);
          }}
          className="grid size-5 place-items-center rounded border border-white/25 bg-black/55 text-white/85 transition-colors hover:bg-black/75"
        >
          <Maximize2 className="size-3" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Download photo"
          title="Download photo"
          disabled={downloading}
          onClick={async (event) => {
            event.stopPropagation();
            setDownloading(true);
            try {
              await onDownload(photo);
            } finally {
              setDownloading(false);
            }
          }}
          className="grid size-5 place-items-center rounded border border-white/25 bg-black/55 text-white/85 transition-colors hover:bg-black/75"
        >
          {downloading ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <Download className="size-3" aria-hidden />
          )}
        </button>
      </div>
    </figure>
  );
}
