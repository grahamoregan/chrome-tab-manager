import type { TabLike } from './tabs';
import { siteOf } from './url';

export interface SiteSummary {
  site: string;
  count: number;
  /** windowId → number of tabs from this site in that window. */
  perWindow: Map<number, number>;
}

/** Sites across all tabs, most tabs first. */
export function summariseSites(tabs: TabLike[]): SiteSummary[] {
  const map = new Map<string, SiteSummary>();
  for (const tab of tabs) {
    const site = siteOf(tab.url);
    if (!site) continue;
    let s = map.get(site);
    if (!s) {
      s = { site, count: 0, perWindow: new Map() };
      map.set(site, s);
    }
    s.count++;
    s.perWindow.set(tab.windowId, (s.perWindow.get(tab.windowId) ?? 0) + 1);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
}

export interface GatherPlan {
  site: string;
  targetWindowId: number;
  /** Unpinned tabs of the site that are not yet in the target window. */
  move: TabLike[];
  /** All unpinned tabs of the site (for grouping in the target window). */
  all: TabLike[];
}

/**
 * Plans pulling every tab of `site` into the window that already has the most
 * of them (ties go to `currentWindowId`, then lowest window id). Pinned tabs
 * are never moved.
 */
export function planGather(tabs: TabLike[], site: string, currentWindowId?: number): GatherPlan | null {
  const siteTabs = tabs.filter((t) => siteOf(t.url) === site);
  if (siteTabs.length === 0) return null;

  const counts = new Map<number, number>();
  for (const t of siteTabs) counts.set(t.windowId, (counts.get(t.windowId) ?? 0) + 1);

  let target = -1;
  let best = -1;
  for (const [windowId, n] of [...counts].sort(([a], [b]) => a - b)) {
    if (n > best || (n === best && windowId === currentWindowId)) {
      best = n;
      target = windowId;
    }
  }

  const unpinned = siteTabs.filter((t) => !t.pinned);
  return {
    site,
    targetWindowId: target,
    move: unpinned.filter((t) => t.windowId !== target),
    all: unpinned,
  };
}

/** Sites spread over more than one window — the ones worth gathering. */
export function scatteredSites(tabs: TabLike[]): SiteSummary[] {
  return summariseSites(tabs).filter((s) => s.perWindow.size > 1);
}

/** Short label for a site's tab group, e.g. `linkedin.com` → `linkedin`, `bbc.co.uk` → `bbc`. */
export function siteLabel(site: string): string {
  if (/^[\d.]+$/.test(site) || site.includes(':')) return site; // IP addresses
  return site.split('.')[0] || site;
}
