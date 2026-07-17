import { getSupabase } from "@/lib/supabase/client";
import type { Dog, Photo } from "@/lib/types";

/**
 * All browser-side Supabase reads and writes, in one place. Every function
 * throws on failure; callers own optimistic state and rollback.
 */

export async function fetchDogs(): Promise<Dog[]> {
  const { data, error } = await getSupabase()
    .from("dogs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Loading dogs failed: ${error.message}`);
  return data as Dog[];
}

export async function fetchUnsortedPhotos(): Promise<Photo[]> {
  const { data, error } = await getSupabase()
    .from("photos")
    .select("*")
    .is("dog_id", null)
    .order("captured_at", { ascending: true });
  if (error) throw new Error(`Loading photos failed: ${error.message}`);
  return data as Photo[];
}

/** Sidebar counts: photos already filed, grouped by dog. */
export async function fetchPhotoCounts(): Promise<Record<string, number>> {
  const { data, error } = await getSupabase()
    .from("photos")
    .select("dog_id")
    .not("dog_id", "is", null);
  if (error) throw new Error(`Loading photo counts failed: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data as { dog_id: string }[]) {
    counts[row.dog_id] = (counts[row.dog_id] ?? 0) + 1;
  }
  return counts;
}

export async function assignPhotosToDog(
  photoIds: string[],
  dogId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("photos")
    .update({ dog_id: dogId })
    .in("id", photoIds);
  if (error) throw new Error(`Filing photos failed: ${error.message}`);
}

export async function setPhotoUsed(
  photoId: string,
  isUsed: boolean,
): Promise<void> {
  const { error } = await getSupabase()
    .from("photos")
    .update({ is_used: isUsed })
    .eq("id", photoId);
  if (error) throw new Error(`Updating photo failed: ${error.message}`);
}

export async function createDog(name: string): Promise<Dog> {
  const { data, error } = await getSupabase()
    .from("dogs")
    .insert({ name, status: "active" })
    .select()
    .single();
  if (error) throw new Error(`Creating dog failed: ${error.message}`);
  return data as Dog;
}
