"use client";

import { Archive, Dog as DogIcon, Plus } from "lucide-react";

import type { Dog } from "@/lib/types";

type SidebarProps = {
  dogs: Dog[];
  photoCounts: Record<string, number>;
  dropTargetId: string | null;
  onCreateDog: () => void;
  onDropOnDog: (dogId: string) => void;
  onDragOverDog: (dogId: string | null) => void;
};

function BucketRow({
  dog,
  count,
  isDropTarget,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  dog: Dog;
  count: number;
  isDropTarget: boolean;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
}) {
  return (
    <li>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors ${
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
  onDropOnDog,
  onDragOverDog,
}: SidebarProps) {
  const active = dogs.filter((dog) => dog.status === "active");
  const adopted = dogs.filter((dog) => dog.status === "adopted");

  const bucketProps = (dog: Dog) => ({
    dog,
    count: photoCounts[dog.id] ?? 0,
    isDropTarget: dropTargetId === dog.id,
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
          onClick={onCreateDog}
          title="New dog bucket"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-white transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus className="size-4" aria-hidden />
          <span className="sr-only">New dog bucket</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {active.length === 0 ? (
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
