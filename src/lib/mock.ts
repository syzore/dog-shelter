import type { Dog, Photo } from "@/lib/types";

/**
 * Stand-in data for the UI shell, replaced by Supabase in step 4.
 *
 * Photos are generated as bursts — tight clusters of near-identical frames a
 * few seconds apart, with long gaps between clusters — because that is the
 * shape the burst selection in step 5 has to cope with.
 */

export const MOCK_DOGS: Dog[] = [
  { id: "d1", name: "Biscuit", status: "active", created_at: "2026-07-01T09:00:00Z" },
  { id: "d2", name: "Juno", status: "active", created_at: "2026-07-03T09:00:00Z" },
  { id: "d3", name: "Pepper", status: "active", created_at: "2026-07-05T09:00:00Z" },
  { id: "d4", name: "Marlow", status: "adopted", created_at: "2026-06-02T09:00:00Z" },
  { id: "d5", name: "Sesame", status: "adopted", created_at: "2026-06-11T09:00:00Z" },
];

function buildMockPhotos(): Photo[] {
  const photos: Photo[] = [];
  const start = new Date("2026-07-16T10:00:00Z").getTime();
  const burstSizes = [5, 3, 7, 4, 6, 2, 5, 4];

  let clock = start;
  let n = 0;

  burstSizes.forEach((size, burstIndex) => {
    for (let i = 0; i < size; i++) {
      // Frames within a burst are ~1.2s apart, well inside the 60s window.
      clock += 1200;
      photos.push({
        id: `p${n}`,
        // Same seed across a burst so frames in one burst look alike.
        r2_url: `https://picsum.photos/seed/burst${burstIndex}/400/300`,
        captured_at: new Date(clock).toISOString(),
        dog_id: null,
        is_used: n % 11 === 0,
      });
      n++;
    }
    // Long gap between bursts so they fall outside each other's window.
    clock += 6 * 60 * 1000;
  });

  return photos;
}

export const MOCK_PHOTOS: Photo[] = buildMockPhotos();
