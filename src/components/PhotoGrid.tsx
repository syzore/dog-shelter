"use client";

import PhotoCard from "@/components/PhotoCard";
import type { Photo } from "@/lib/types";

type PhotoGridProps = {
  photos: Photo[];
  selectedIds: Set<string>;
  onToggleSelect: (photo: Photo, additive: boolean) => void;
  onToggleUsed: (photo: Photo) => void;
  onBurstSelect: (photo: Photo) => void;
  onRangeSelect: (photo: Photo) => void;
  onOpenFullscreen: (photo: Photo) => void;
  onDownload: (photo: Photo) => void;
  onDragStart: (photo: Photo, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onClearSelection: () => void;
  emptyLabel: string;
};

export default function PhotoGrid({
  photos,
  selectedIds,
  onToggleSelect,
  onToggleUsed,
  onBurstSelect,
  onRangeSelect,
  onOpenFullscreen,
  onDownload,
  onDragStart,
  onDragEnd,
  onClearSelection,
  emptyLabel,
}: PhotoGridProps) {
  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto p-3"
      // Clicking the backdrop, not a photo, clears the selection.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClearSelection();
      }}
    >
      {photos.length === 0 ? (
        <p className="grid h-full place-items-center text-sm text-muted">
          {emptyLabel}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              isSelected={selectedIds.has(photo.id)}
              onToggleSelect={onToggleSelect}
              onToggleUsed={onToggleUsed}
              onBurstSelect={onBurstSelect}
              onRangeSelect={onRangeSelect}
              onOpenFullscreen={onOpenFullscreen}
              onDownload={onDownload}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </section>
  );
}
