import { isProtected, type TabLike } from './tabs';
import { isWebUrl, normaliseUrl } from './url';

export interface DuplicateGroup {
  key: string;
  keep: TabLike[];
  close: TabLike[];
}

/**
 * Groups open tabs by normalised URL. In each group with more than one tab,
 * keeps the most recently accessed tab and closes the rest. Pinned and audible
 * tabs are never closed; if any exist in a group they are the ones kept.
 */
export function findDuplicates(tabs: TabLike[]): DuplicateGroup[] {
  const byKey = new Map<string, TabLike[]>();
  for (const tab of tabs) {
    if (!isWebUrl(tab.url)) continue;
    const key = normaliseUrl(tab.url);
    const list = byKey.get(key);
    if (list) list.push(tab);
    else byKey.set(key, [tab]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const protectedTabs = list.filter(isProtected);
    let keep: TabLike[];
    if (protectedTabs.length > 0) {
      keep = protectedTabs;
    } else {
      const newest = list.reduce((best, t) => (isMoreRecent(t, best) ? t : best));
      keep = [newest];
    }
    const close = list.filter((t) => !keep.includes(t));
    if (close.length > 0) groups.push({ key, keep, close });
  }
  return groups;
}

/** Active tabs count as most recent; then lastAccessed; then higher id (opened later). */
function isMoreRecent(a: TabLike, b: TabLike): boolean {
  if (!!a.active !== !!b.active) return !!a.active;
  const la = a.lastAccessed ?? 0;
  const lb = b.lastAccessed ?? 0;
  if (la !== lb) return la > lb;
  return a.id > b.id;
}

export function tabsToClose(groups: DuplicateGroup[]): TabLike[] {
  return groups.flatMap((g) => g.close);
}
