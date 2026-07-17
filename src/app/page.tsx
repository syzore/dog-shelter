"use client";

import { useMemo, useState } from "react";

import PhotoGrid from "@/components/PhotoGrid";
import Sidebar from "@/components/Sidebar";
import { MOCK_DOGS, MOCK_PHOTOS } from "@/lib/mock";
import type { Dog, Photo } from "@/lib/types";

export default function TriagePage() {
  const [dogs, setDogs] = useState<Dog[]>(MOCK_DOGS);
  const [photos, setPhotos] = useState<Photo[]>(MOCK_PHOTOS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const unsorted = useMemo(
    () =>
      photos
        .filter((photo) => photo.dog_id === null)
        .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    [photos],
  );

  const photoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const photo of photos) {
      if (photo.dog_id) counts[photo.dog_id] = (counts[photo.dog_id] ?? 0) + 1;
    }
    return counts;
  }, [photos]);

  const toggleSelect = (photo: Photo, additive: boolean) => {
    setSelectedIds((previous) => {
      if (!additive) {
        // A plain click on the only selected photo deselects it.
        return previous.has(photo.id) && previous.size === 1
          ? new Set()
          : new Set([photo.id]);
      }
      const next = new Set(previous);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    });
  };

  const toggleUsed = (photo: Photo) => {
    setPhotos((previous) =>
      previous.map((candidate) =>
        candidate.id === photo.id
          ? { ...candidate, is_used: !candidate.is_used }
          : candidate,
      ),
    );
  };

  // Placeholder until step 5 replaces it with canvas-based MSE matching.
  const burstSelect = (photo: Photo) => {
    setSelectedIds((previous) => new Set(previous).add(photo.id));
  };

  const handleDragStart = (photo: Photo) => {
    // Dragging an unselected photo drags just that photo; dragging a selected
    // one drags the whole selection.
    if (!selectedIds.has(photo.id)) setSelectedIds(new Set([photo.id]));
  };

  const handleDropOnDog = (dogId: string) => {
    setDropTargetId(null);
    if (selectedIds.size === 0) return;

    setPhotos((previous) =>
      previous.map((photo) =>
        selectedIds.has(photo.id) ? { ...photo, dog_id: dogId } : photo,
      ),
    );
    setSelectedIds(new Set());
  };

  const createDog = () => {
    const name = window.prompt("Name of the new dog?")?.trim();
    if (!name) return;
    setDogs((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        name,
        status: "active",
        created_at: new Date().toISOString(),
      },
    ]);
  };

  return (
    <main className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        dogs={dogs}
        photoCounts={photoCounts}
        dropTargetId={dropTargetId}
        onCreateDog={createDog}
        onDropOnDog={handleDropOnDog}
        onDragOverDog={setDropTargetId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">
            Unsorted
            <span className="ml-2 font-normal tabular-nums text-muted">
              {unsorted.length}
            </span>
          </h2>
          {selectedIds.size > 0 && (
            <p className="text-xs text-muted">
              {selectedIds.size} selected — drag onto a dog to file
            </p>
          )}
        </header>

        <PhotoGrid
          photos={unsorted}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleUsed={toggleUsed}
          onBurstSelect={burstSelect}
          onDragStart={handleDragStart}
          onDragEnd={() => setDropTargetId(null)}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      </div>
    </main>
  );
}
