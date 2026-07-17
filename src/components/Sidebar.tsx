"use client";

import { useRef, useState } from "react";

import { Archive, ArchiveRestore, Dog as DogIcon, Plus } from "lucide-react";

import type { Dog } from "@/lib/types";

type SidebarProps = {
  dogs: Dog[];
  photoCounts: Record<string, number>;
  dropTargetId: string | null;
  onCreateDog: (name: string) => void;
  onSetDogStatus: (dog: Dog, status: Dog["status"]) => void;
  onDropOnDog: (dogId: string) => void;
  onDragOverDog: (dogId: string | null) => void;
};

function BucketRow({
  dog,
  count,
  isDropTarget,
  onSetStatus,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  dog: Dog;
  count: number;
  isDropTarget: boolean;
  onSetStatus: (status: Dog["status"]) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
}) {
  const adopted = dog.status === "adopted";
  return (
    <li>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors ${
          isDropTarget
            ? "border-accent bg-accent/15 text-foreground"
            : "border-transparent text-foreground/90 hover:bg-surface-raised"
        }`}
      >
        <DogIcon
          className={`size-4 shrink-0 ${isDropTarget ? "text-accent" : "text-muted"}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{dog.name}</span>
        <button
          type="button"
          title={adopted ? "Move back to active" : "Mark as adopted"}
          aria-label={
            adopted
              ? `Move ${dog.name} back to active`
              : `Mark ${dog.name} as adopted`
          }
          onClick={() => onSetStatus(adopted ? "active" : "adopted")}
          className="hidden shrink-0 text-muted transition-colors hover:text-foreground group-hover:block"
        >
          {adopted ? (
            <ArchiveRestore className="size-3.5" aria-hidden />
          ) : (
            <Archive className="size-3.5" aria-hidden />
          )}
        </button>
        <span className="shrink-0 tabular-nums text-xs text-muted">{count}</span>
      </div>
    </li>
  );
}

export default function Sidebar({
  dogs,
  photoCounts,
  dropTargetId,
  onCreateDog,
  onSetDogStatus,
  onDropOnDog,
  onDragOverDog,
}: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const active = dogs.filter((dog) => dog.status === "active");
  const adopted = dogs.filter((dog) => dog.status === "adopted");

  const submitDraft = () => {
    const name = draft.trim();
    if (name) onCreateDog(name);
    setDraft("");
    setCreating(false);
  };

  const bucketProps = (dog: Dog) => ({
    dog,
    count: photoCounts[dog.id] ?? 0,
    isDropTarget: dropTargetId === dog.id,
    onSetStatus: (status: Dog["status"]) => onSetDogStatus(dog, status),
    onDragOver: (event: React.DragEvent) => {
      // Preventing default is what marks this element as a valid drop target.
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      onDragOverDog(dog.id);
    },
    onDragLeave: () => onDragOverDog(null),
    onDrop: (event: React.DragEvent) => {
      // Without this the browser treats the payload as a navigation.
      event.preventDefault();
      onDropOnDog(dog.id);
    },
  });

  return (
    <aside className="flex h-full w-1/5 min-w-52 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <h1 className="truncate text-sm font-semibold">Dogs</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="New dog bucket"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-white transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus className="size-4" aria-hidden />
          <span className="sr-only">New dog bucket</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {creating && (
          <input
            ref={(node) => {
              inputRef.current = node;
              node?.focus();
            }}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitDraft();
              if (event.key === "Escape") {
                setDraft("");
                setCreating(false);
              }
            }}
            onBlur={submitDraft}
            placeholder="Dog's name…"
            className="mb-1 w-full rounded-md border border-accent bg-surface-raised px-2.5 py-2 text-sm outline-none placeholder:text-muted"
          />
        )}

        {active.length === 0 && !creating ? (
          <p className="px-2.5 py-2 text-xs text-muted">
            No dogs yet. Use + to add one.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {active.map((dog) => (
              <BucketRow key={dog.id} {...bucketProps(dog)} />
            ))}
          </ul>
        )}

        {adopted.length > 0 && (
          <div className="mt-4">
            <h2 className="flex items-center gap-1.5 px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              <Archive className="size-3" aria-hidden />
              Archive
            </h2>
            <ul className="space-y-0.5 opacity-60">
              {adopted.map((dog) => (
                <BucketRow key={dog.id} {...bucketProps(dog)} />
              ))}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  );
}
