"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Loader2, Upload } from "lucide-react";

import Lightbox from "@/components/Lightbox";
import PhotoGrid from "@/components/PhotoGrid";
import Sidebar from "@/components/Sidebar";
import { findBurst } from "@/lib/burst";
import {
  assignPhotosToDog,
  createDog,
  fetchDogs,
  fetchPhotoCounts,
  fetchPhotosForDog,
  fetchUnsortedCount,
  fetchUnsortedPhotos,
  renameDog,
  setDogStatus,
  setPhotoUsed,
} from "@/lib/data";
import { downloadPhoto } from "@/lib/download";
import type { Dog, Photo } from "@/lib/types";
import { uploadPhotos } from "@/lib/upload";

type LoadState = "loading" | "ready" | "error";

export default function TriagePage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string>("");
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filedCounts, setFiledCounts] = useState<Record<string, number>>({});
  const [unsortedCount, setUnsortedCount] = useState(0);
  // null = the unsorted pile; otherwise the dog whose photos are shown.
  const [activeDogId, setActiveDogId] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // The pivot a shift+click ranges from — the last individually-touched photo.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [unsortedIsDropTarget, setUnsortedIsDropTarget] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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
      setUnsortedCount(photoRows.length);
      setActiveDogId(null);
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

  const displayedPhotos = useMemo(
    () =>
      [...photos].sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    [photos],
  );

  const activeDog = activeDogId
    ? dogs.find((dog) => dog.id === activeDogId) ?? null
    : null;

  const selectView = async (dogId: string | null) => {
    if (dogId === activeDogId) return;
    setActiveDogId(dogId);
    setSelectedIds(new Set());
    setAnchorId(null);
    setLightboxIndex(null);
    setViewLoading(true);
    try {
      // Refetch counts alongside the rows so optimistic drift is corrected on
      // every view switch.
      const [rows, counts, uCount] = await Promise.all([
        dogId === null ? fetchUnsortedPhotos() : fetchPhotosForDog(dogId),
        fetchPhotoCounts(),
        fetchUnsortedCount(),
      ]);
      setPhotos(rows);
      setFiledCounts(counts);
      setUnsortedCount(uCount);
    } catch (error) {
      reportActionError(
        error instanceof Error ? error.message : "Loading that view failed.",
      );
    } finally {
      setViewLoading(false);
    }
  };

  const toggleSelect = (photo: Photo, additive: boolean) => {
    // Any direct click on a photo becomes the anchor for the next shift+click.
    setAnchorId(photo.id);
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

  // Shift+click: select every photo between the anchor and this one, in the
  // grid's visual order. With no anchor yet, behaves like a plain select.
  const rangeSelect = (photo: Photo) => {
    const ids = displayedPhotos.map((candidate) => candidate.id);
    const from = anchorId ? ids.indexOf(anchorId) : -1;
    const to = ids.indexOf(photo.id);
    if (from === -1 || to === -1) {
      setAnchorId(photo.id);
      setSelectedIds(new Set([photo.id]));
      return;
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    setSelectedIds(new Set(ids.slice(lo, hi + 1)));
    // Anchor stays put so repeated shift+clicks re-range from the same pivot.
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

  const burstBusy = useRef(false);
  const burstSelect = (photo: Photo) => {
    // Select the anchor immediately so the gesture feels instant, then grow
    // the selection as comparisons resolve.
    setAnchorId(photo.id);
    setSelectedIds((previous) => new Set(previous).add(photo.id));
    if (burstBusy.current) return;
    burstBusy.current = true;

    findBurst(displayedPhotos, photo)
      .then(({ ids, failures }) => {
        setSelectedIds((previous) => new Set([...previous, ...ids]));
        if (failures > 0) {
          reportActionError(
            `${failures} nearby photo(s) could not be compared (image load failed — check bucket CORS).`,
          );
        }
      })
      .catch((error) =>
        reportActionError(
          error instanceof Error ? error.message : "Burst detection failed.",
        ),
      )
      .finally(() => {
        burstBusy.current = false;
      });
  };

  const handleDragStart = (photo: Photo, event: React.DragEvent) => {
    // Dragging an unselected photo drags just that photo; dragging a selected
    // one drags the whole selection.
    const draggingCount = selectedIds.has(photo.id) ? selectedIds.size : 1;
    if (!selectedIds.has(photo.id)) setSelectedIds(new Set([photo.id]));

    if (draggingCount > 1) {
      // Replace the default single-image ghost with a small count badge so it's
      // obvious the whole stack is moving.
      const badge = document.createElement("div");
      badge.textContent = `${draggingCount} photos`;
      badge.style.cssText =
        "position:absolute;top:-1000px;left:-1000px;padding:6px 12px;" +
        "border-radius:9999px;background:#6366f1;color:#fff;font:600 13px sans-serif;" +
        "box-shadow:0 4px 12px rgba(0,0,0,.4);white-space:nowrap;";
      document.body.appendChild(badge);
      event.dataTransfer.setDragImage(badge, -12, -12);
      // The browser snapshots the element synchronously; drop it next tick.
      window.setTimeout(() => badge.remove(), 0);
    }
  };

  // Move n photos' worth of count from one bucket to another (null = unsorted).
  const applyCountDelta = (
    from: string | null,
    to: string | null,
    n: number,
  ) => {
    if (from === null) setUnsortedCount((count) => Math.max(0, count - n));
    else
      setFiledCounts((counts) => ({
        ...counts,
        [from]: Math.max(0, (counts[from] ?? 0) - n),
      }));
    if (to === null) setUnsortedCount((count) => count + n);
    else
      setFiledCounts((counts) => ({
        ...counts,
        [to]: (counts[to] ?? 0) + n,
      }));
  };

  const handleDrop = (targetDogId: string | null) => {
    setDropTargetId(null);
    setUnsortedIsDropTarget(false);
    if (selectedIds.size === 0) return;
    // Dropping onto the bucket you're already viewing changes nothing.
    if (targetDogId === activeDogId) {
      setSelectedIds(new Set());
      return;
    }

    const movedIds = [...selectedIds];
    const movedPhotos = photos.filter((photo) => movedIds.includes(photo.id));
    // Every displayed photo belongs to the active view, so that's the source.
    const source = activeDogId;

    setPhotos((previous) => previous.filter((photo) => !movedIds.includes(photo.id)));
    applyCountDelta(source, targetDogId, movedIds.length);
    setSelectedIds(new Set());

    assignPhotosToDog(movedIds, targetDogId).catch((error) => {
      setPhotos((previous) =>
        [...previous, ...movedPhotos].sort((a, b) =>
          a.captured_at.localeCompare(b.captured_at),
        ),
      );
      applyCountDelta(targetDogId, source, movedIds.length);
      reportActionError(error instanceof Error ? error.message : "Move failed.");
    });
  };

  const handleCreateDog = (name: string) => {
    createDog(name)
      .then((dog) => setDogs((previous) => [...previous, dog]))
      .catch((error) =>
        reportActionError(error instanceof Error ? error.message : "Create failed."),
      );
  };

  const handleRenameDog = (dog: Dog, name: string) => {
    setDogs((previous) =>
      previous.map((candidate) =>
        candidate.id === dog.id ? { ...candidate, name } : candidate,
      ),
    );
    renameDog(dog.id, name).catch((error) => {
      setDogs((previous) =>
        previous.map((candidate) =>
          candidate.id === dog.id ? { ...candidate, name: dog.name } : candidate,
        ),
      );
      reportActionError(error instanceof Error ? error.message : "Rename failed.");
    });
  };

  const handleSetDogStatus = (dog: Dog, status: Dog["status"]) => {
    setDogs((previous) =>
      previous.map((candidate) =>
        candidate.id === dog.id ? { ...candidate, status } : candidate,
      ),
    );
    setDogStatus(dog.id, status).catch((error) => {
      setDogs((previous) =>
        previous.map((candidate) =>
          candidate.id === dog.id ? { ...candidate, status: dog.status } : candidate,
        ),
      );
      reportActionError(error instanceof Error ? error.message : "Update failed.");
    });
  };

  const handleFilesChosen = async (fileList: FileList | null) => {
    const files = fileList ? [...fileList] : [];
    if (files.length === 0) return;
    // Uploaded photos always land unsorted, whatever view we're in.
    const viewingUnsorted = activeDogId === null;

    setUploading({ done: 0, total: files.length });
    const outcomes = await uploadPhotos(files, (outcome, completed) => {
      setUploading({ done: completed, total: files.length });
      if (outcome.status === "uploaded") {
        setUnsortedCount((count) => count + 1);
        if (viewingUnsorted) {
          setPhotos((previous) =>
            [...previous, outcome.photo].sort((a, b) =>
              a.captured_at.localeCompare(b.captured_at),
            ),
          );
        }
      }
    });
    setUploading(null);

    const duplicates = outcomes.filter((o) => o.status === "duplicate").length;
    const failed = outcomes.filter((o) => o.status === "failed");
    const notes: string[] = [];
    if (duplicates > 0) notes.push(`${duplicates} already existed (skipped)`);
    if (failed.length > 0) {
      const firstError = failed[0].status === "failed" ? failed[0].error : "";
      notes.push(`${failed.length} failed: ${firstError}`);
    }
    if (notes.length > 0) reportActionError(notes.join(" · "));
  };

  // Returns the promise so the button can show progress: originals can be
  // 25MB+, and fetching one takes several seconds.
  const handleDownload = (photo: Photo) => downloadPhoto(photo.r2_url);

  const openFullscreen = (photo: Photo) => {
    const index = displayedPhotos.findIndex((p) => p.id === photo.id);
    if (index >= 0) setLightboxIndex(index);
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

  const headerTitle = activeDog ? activeDog.name : "Unsorted";
  const emptyLabel = activeDog
    ? `No photos filed under ${activeDog.name} yet.`
    : "Nothing left to sort.";

  return (
    <main className="flex h-dvh w-full overflow-hidden">
      <Sidebar
        dogs={dogs}
        photoCounts={filedCounts}
        unsortedCount={unsortedCount}
        activeDogId={activeDogId}
        dropTargetId={dropTargetId}
        unsortedIsDropTarget={unsortedIsDropTarget}
        onSelectView={(dogId) => void selectView(dogId)}
        onCreateDog={handleCreateDog}
        onRenameDog={handleRenameDog}
        onSetDogStatus={handleSetDogStatus}
        onDropOnDog={handleDrop}
        onDragOverDog={setDropTargetId}
        onDragOverUnsorted={setUnsortedIsDropTarget}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {headerTitle}
            <span className="font-normal tabular-nums text-muted">
              {displayedPhotos.length}
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
                {selectedIds.size} selected — drag onto a bucket
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

        {viewLoading ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden />
          </div>
        ) : (
          <PhotoGrid
            photos={displayedPhotos}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleUsed={toggleUsed}
            onBurstSelect={burstSelect}
            onRangeSelect={rangeSelect}
            onOpenFullscreen={openFullscreen}
            onDownload={handleDownload}
            onDragStart={handleDragStart}
            onDragEnd={() => {
              setDropTargetId(null);
              setUnsortedIsDropTarget(false);
            }}
            onClearSelection={() => {
              setSelectedIds(new Set());
              setAnchorId(null);
            }}
            emptyLabel={emptyLabel}
          />
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={displayedPhotos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={handleDownload}
        />
      )}
    </main>
  );
}
