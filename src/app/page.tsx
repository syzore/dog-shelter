"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Loader2, Upload } from "lucide-react";

import PhotoGrid from "@/components/PhotoGrid";
import Sidebar from "@/components/Sidebar";
import {
  assignPhotosToDog,
  createDog,
  fetchDogs,
  fetchPhotoCounts,
  fetchUnsortedPhotos,
  setPhotoUsed,
} from "@/lib/data";
import type { Dog, Photo } from "@/lib/types";
import { uploadPhotos } from "@/lib/upload";

type LoadState = "loading" | "ready" | "error";

export default function TriagePage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string>("");
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filedCounts, setFiledCounts] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>("");
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial state is already "loading"; Retry resets it before calling this.
  const load = useCallback(async () => {
    try {
      const [dogRows, photoRows, counts] = await Promise.all([
        fetchDogs(),
        fetchUnsortedPhotos(),
        fetchPhotoCounts(),
      ]);
      setDogs(dogRows);
      setPhotos(photoRows);
      setFiledCounts(counts);
      setLoadState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Load failed.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: every setState in load() happens after an await, so
    // nothing renders synchronously from the effect body — the rule can't see
    // through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Surface a failed write briefly, then let the UI move on.
  const reportActionError = (message: string) => {
    setActionError(message);
    window.setTimeout(() => setActionError(""), 6000);
  };

  const unsorted = useMemo(
    () =>
      [...photos].sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    [photos],
  );

  const toggleSelect = (photo: Photo, additive: boolean) => {
    setSelectedIds((previous) => {
      if (!additive) {
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
    const nextUsed = !photo.is_used;
    setPhotos((previous) =>
      previous.map((candidate) =>
        candidate.id === photo.id
          ? { ...candidate, is_used: nextUsed }
          : candidate,
      ),
    );
    setPhotoUsed(photo.id, nextUsed).catch((error) => {
      // Roll back the one photo we touched.
      setPhotos((previous) =>
        previous.map((candidate) =>
          candidate.id === photo.id
            ? { ...candidate, is_used: photo.is_used }
            : candidate,
        ),
      );
      reportActionError(error instanceof Error ? error.message : "Update failed.");
    });
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

    const filedIds = [...selectedIds];
    const filedPhotos = photos.filter((photo) => filedIds.includes(photo.id));

    // Optimistic: remove from the grid and bump the bucket count immediately.
    setPhotos((previous) => previous.filter((photo) => !filedIds.includes(photo.id)));
    setFiledCounts((previous) => ({
      ...previous,
      [dogId]: (previous[dogId] ?? 0) + filedIds.length,
    }));
    setSelectedIds(new Set());

    assignPhotosToDog(filedIds, dogId).catch((error) => {
      // Roll back: photos return to the grid, count comes back down.
      setPhotos((previous) =>
        [...previous, ...filedPhotos].sort((a, b) =>
          a.captured_at.localeCompare(b.captured_at),
        ),
      );
      setFiledCounts((previous) => ({
        ...previous,
        [dogId]: Math.max(0, (previous[dogId] ?? 0) - filedIds.length),
      }));
      reportActionError(error instanceof Error ? error.message : "Filing failed.");
    });
  };

  const handleCreateDog = () => {
    const name = window.prompt("Name of the new dog?")?.trim();
    if (!name) return;

    createDog(name)
      .then((dog) => setDogs((previous) => [...previous, dog]))
      .catch((error) =>
        reportActionError(error instanceof Error ? error.message : "Create failed."),
      );
  };

  const handleFilesChosen = async (fileList: FileList | null) => {
    const files = fileList ? [...fileList] : [];
    if (files.length === 0) return;

    setUploading({ done: 0, total: files.length });
    const outcomes = await uploadPhotos(files, (outcome, completed) => {
      setUploading({ done: completed, total: files.length });
      if (outcome.ok) {
        setPhotos((previous) =>
          [...previous, outcome.photo].sort((a, b) =>
            a.captured_at.localeCompare(b.captured_at),
          ),
        );
      }
    });
    setUploading(null);

    const failed = outcomes.filter((outcome) => !outcome.ok);
    if (failed.length > 0) {
      reportActionError(
        `${failed.length} of ${files.length} uploads failed: ${failed[0].ok ? "" : failed[0].error}`,
      );
    }
  };

  if (loadState === "loading") {
    return (
      <main className="grid h-dvh place-items-center">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="grid h-dvh place-items-center">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-sm text-red-400">{loadError}</p>
          <p className="text-xs text-muted">
            If the tables are missing, run supabase/schema.sql in the Supabase
            SQL editor first.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadState("loading");
              void load();
            }}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-85"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        dogs={dogs}
        photoCounts={filedCounts}
        dropTargetId={dropTargetId}
        onCreateDog={handleCreateDog}
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

          <div className="flex items-center gap-3">
            {actionError && (
              <p className="max-w-xs truncate text-xs text-red-400" title={actionError}>
                {actionError}
              </p>
            )}
            {selectedIds.size > 0 && (
              <p className="text-xs text-muted">
                {selectedIds.size} selected — drag onto a dog to file
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/heic"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleFilesChosen(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading !== null}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {uploading.done}/{uploading.total}
                </>
              ) : (
                <>
                  <Upload className="size-3.5" aria-hidden />
                  Upload
                </>
              )}
            </button>
          </div>
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
