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

export const DEFAULT_SPLIT_SIZE = 80;
export const MIN_SPLIT_SIZE = 5;
export const MAX_SPLIT_SIZE = 500;

export function clampSplitSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SPLIT_SIZE;
  return Math.min(MAX_SPLIT_SIZE, Math.max(MIN_SPLIT_SIZE, Math.round(n)));
}

/** A run of tabs that moves together: one ungrouped tab, or a whole tab group. */
export interface SplitUnit {
  groupId?: number;
  tabs: TabLike[];
}

export interface SplitPlan {
  windowId: number;
  /** Tabs that stay in the original window (pinned, the manager, and the first chunk). */
  keep: TabLike[];
  /** One entry per new window, each a list of units in tab order. */
  newWindows: SplitUnit[][];
  /** All tabs that move, in order. */
  moving: TabLike[];
}

const grouped = (t: TabLike) => t.groupId !== undefined && t.groupId !== -1;

/**
 * Plans splitting one window into windows of at most `size` tabs, keeping tab order.
 * Pinned tabs and tabs matching `stays` (the manager) remain in the original window and
 * count towards its limit. Tab groups are never broken up, so a window may go over the
 * limit only when a single group is bigger than it. Returns null if nothing would move.
 */
export function planSplit(tabs: TabLike[], windowId: number, size: number, stays: (t: TabLike) => boolean = () => false): SplitPlan | null {
  const limit = clampSplitSize(size);
  const inWindow = tabs.filter((t) => t.windowId === windowId).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (inWindow.length <= limit) return null;
  const fixed = inWindow.filter((t) => t.pinned || stays(t));
  const fixedIds = new Set(fixed.map((t) => t.id));

  const units: SplitUnit[] = [];
  for (const t of inWindow) {
    if (fixedIds.has(t.id)) continue;
    const last = units[units.length - 1];
    if (grouped(t) && last?.groupId === t.groupId) last.tabs.push(t);
    else units.push(grouped(t) ? { groupId: t.groupId, tabs: [t] } : { tabs: [t] });
  }

  const chunks: SplitUnit[][] = [[]];
  let count = fixed.length;
  for (const u of units) {
    // Start a new window when this unit won't fit, unless the current one is still empty.
    if (count > 0 && count + u.tabs.length > limit) {
      chunks.push([]);
      count = 0;
    }
    chunks[chunks.length - 1].push(u);
    count += u.tabs.length;
  }
  const [first, ...rest] = chunks;
  if (rest.length === 0) return null;
  const keep = inWindow.filter((t) => fixedIds.has(t.id) || first.some((u) => u.tabs.includes(t)));
  return { windowId, keep, newWindows: rest, moving: rest.flat().flatMap((u) => u.tabs) };
}
