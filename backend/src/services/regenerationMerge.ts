import type { ItemMeta } from "@interview-prep-kit/shared";

interface MergeableItem {
  id: string;
  _meta?: ItemMeta;
}

/**
 * The merge boundary for non-destructive regeneration (RFC-001 section
 * 3.3): an item survives a regeneration of its section unless it's both
 * machine-generated AND unpinned. A hand-edited item, or a pinned
 * generated item the user liked as-is, is kept untouched no matter what.
 */
export function partitionForRegeneration<T extends MergeableItem>(items: T[]): { keep: T[]; discard: T[] } {
  const keep: T[] = [];
  const discard: T[] = [];
  for (const item of items) {
    const isProtected = item._meta ? item._meta.source !== "generated" || item._meta.pinned : true;
    (isProtected ? keep : discard).push(item);
  }
  return { keep, discard };
}

/** Assigns fresh, collision-free ids continuing from the highest existing numeric suffix (e.g. "q3" -> next is "q4"). */
export function makeIdAllocator(existingIds: string[], prefix: string): () => string {
  const numbers = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((n) => Number.isFinite(n) && n >= 0);
  let counter = numbers.length > 0 ? Math.max(...numbers) : 0;
  return () => `${prefix}${++counter}`;
}

/** order values for newly-appended items, continuing after the highest existing order in `keep`. */
export function nextOrderAfter(items: { _meta?: ItemMeta }[]): number {
  const orders = items.map((i) => i._meta?.order ?? 0);
  return (orders.length > 0 ? Math.max(...orders) : 0) + 1000;
}
