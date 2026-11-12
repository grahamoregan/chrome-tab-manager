import type { TabLike } from './tabs';

export interface MergePlan {
  targetWindowId: number;
  /** Selected windows other than the target, whose tabs all move. */
  sourceWindowIds: number[];
  /** Tabs that will move into the target window. */
  moving: TabLike[];
}

/**
 * Plans merging the selected windows into the one with the most tabs.
 * Ties go to the current window, then the lowest window id. Returns null
 * unless at least two of the selected windows have tabs.
 */
export function planMerge(tabs: TabLike[], selectedWindowIds: number[], currentWindowId?: number): MergePlan | null {
  const counts = new Map<number, number>();
  for (const id of selectedWindowIds) counts.set(id, 0);
  for (const t of tabs) if (counts.has(t.windowId)) counts.set(t.windowId, counts.get(t.windowId)! + 1);
  const candidates = [...counts].filter(([, n]) => n > 0).sort(([a], [b]) => a - b);
  if (candidates.length < 2) return null;

  let [target, best] = candidates[0];
  for (const [id, n] of candidates) {
    if (n > best || (n === best && id === currentWindowId)) {
      target = id;
      best = n;
    }
  }
  const sourceWindowIds = candidates.map(([id]) => id).filter((id) => id !== target);
  const sources = new Set(sourceWindowIds);
  return { targetWindowId: target, sourceWindowIds, moving: tabs.filter((t) => sources.has(t.windowId)) };
}
