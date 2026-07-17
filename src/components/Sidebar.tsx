"use client";

import { useState } from "react";

import {
  Archive,
  ArchiveRestore,
  Dog as DogIcon,
  Images,
  Pencil,
  Plus,
} from "lucide-react";

import type { Dog } from "@/lib/types";

type SidebarProps = {
  dogs: Dog[];
  photoCounts: Record<string, number>;
  unsortedCount: number;
  activeDogId: string | null;
  dropTargetId: string | null;
  unsortedIsDropTarget: boolean;
  onSelectView: (dogId: string | null) => void;
  onCreateDog: (name: string) => void;
  onRenameDog: (dog: Dog, name: string) => void;
  onSetDogStatus: (dog: Dog, status: Dog["status"]) => void;
  onDropOnDog: (dogId: string | null) => void;
  onDragOverDog: (dogId: string | null) => void;
  onDragOverUnsorted: (over: boolean) => void;
};

function BucketRow({
  dog,
  count,
  isActive,
  isDropTarget,
  onSelect,
  onSetStatus,
  onRename,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  dog: Dog;
  count: number;
  isActive: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onSetStatus: (status: Dog["status"]) => void;
  onRename: (name: string) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dog.name);
  const adopted = dog.status === "adopted";

  const startEdit = () => {
    setDraft(dog.name);
    setEditing(true);
  };

  const commit = () => {
    const name = draft.trim();
    if (name && name !== dog.name) onRename(name);
    setEditing(false);
  };

  return (
    <li>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => {
          if (!editing) onSelect();
        }}
        className={`group flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors ${
          isDropTarget
            ? "border-accent bg-accent/15 text-foreground"
            : isActive
              ? "border-transparent bg-surface-raised text-foreground"
              : "border-transparent text-foreground/90 hover:bg-surface-raised"
        }`}
      >
        <DogIcon
          className={`size-4 shrink-0 ${
            isDropTarget || isActive ? "text-accent" : "text-muted"
          }`}
          aria-hidden
        />

        {editing ? (
          <input
            autoFocus
            value={draft}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setEditing(false);
            }}
            onBlur={commit}
            className="min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 text-sm outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{dog.name}</span>
        )}

        {!editing && (
          <>
            <button
              type="button"
              title="Rename"
              aria-label={`Rename ${dog.name}`}
              onClick={(event) => {
                event.stopPropagation();
                startEdit();
              }}
              className="hidden shrink-0 text-muted transition-colors hover:text-foreground group-hover:block"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              title={adopted ? "Move back to active" : "Mark as adopted"}
              aria-label={
                adopted
                  ? `Move ${dog.name} back to active`
                  : `Mark ${dog.name} as adopted`
              }
              onClick={(event) => {
                event.stopPropagation();
                onSetStatus(adopted ? "active" : "adopted");
              }}
              className="hidden shrink-0 text-muted transition-colors hover:text-foreground group-hover:block"
            >
              {adopted ? (
                <ArchiveRestore className="size-3.5" aria-hidden />
              ) : (
                <Archive className="size-3.5" aria-hidden />
              )}
            </button>
            <span className="shrink-0 tabular-nums text-xs text-muted">
              {count}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

export default function Sidebar({
  dogs,
  photoCounts,
  unsortedCount,
  activeDogId,
  dropTargetId,
  unsortedIsDropTarget,
  onSelectView,
  onCreateDog,
  onRenameDog,
  onSetDogStatus,
  onDropOnDog,
  onDragOverDog,
  onDragOverUnsorted,
}: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

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
    isActive: activeDogId === dog.id,
    isDropTarget: dropTargetId === dog.id,
    onSelect: () => onSelectView(dog.id),
    onSetStatus: (status: Dog["status"]) => onSetDogStatus(dog, status),
    onRename: (name: string) => onRenameDog(dog, name),
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

  const unsortedActive = activeDogId === null;

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
        <div
          onClick={() => onSelectView(null)}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            onDragOverUnsorted(true);
          }}
          onDragLeave={() => onDragOverUnsorted(false)}
          onDrop={(event) => {
            event.preventDefault();
            onDropOnDog(null);
          }}
          className={`mb-1 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors ${
            unsortedIsDropTarget
              ? "border-accent bg-accent/15 text-foreground"
              : unsortedActive
                ? "border-transparent bg-surface-raised text-foreground"
                : "border-transparent text-foreground/90 hover:bg-surface-raised"
          }`}
        >
          <Images
            className={`size-4 shrink-0 ${
              unsortedIsDropTarget || unsortedActive ? "text-accent" : "text-muted"
            }`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">Unsorted</span>
          <span className="shrink-0 tabular-nums text-xs text-muted">
            {unsortedCount}
          </span>
        </div>

        <div className="my-2 border-t border-border" />

        {creating && (
          <input
            autoFocus
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
            <ul className="space-y-0.5">
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
