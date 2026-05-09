import { loadAdminBaseEntryFromDb } from "@/lib/adminEntryLookupCore";
import { loadPageRaw, type Bbox, type Entry } from "@/lib/data";
import { getDb } from "@/lib/db";

export type { Bbox };
export { loadAdminBaseEntryFromDb };

export async function loadAdminBaseEntry(stem: string, index: number): Promise<Entry | null> {
  const page = await loadPageRaw(stem);
  const entry = page?.entries[index];
  if (entry) return entry;
  return loadAdminBaseEntryFromDb(getDb(), stem, index);
}
