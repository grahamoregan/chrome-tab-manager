import type { Project } from './model';
import { isProtected, type TabLike } from './tabs';
import { normaliseUrl } from './url';

/** Open tabs grouped by normalised URL (= link id), most recently viewed first. */
export function openTabsByLink(tabs: TabLike[], skip: (url: string) => boolean = () => false): Map<string, TabLike[]> {
  const m = new Map<string, TabLike[]>();
  for (const t of tabs) {
    if (skip(t.url)) continue;
    const id = normaliseUrl(t.url);
    m.set(id, [...(m.get(id) ?? []), t]);
  }
  for (const list of m.values()) list.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return m;
}

/** Open tabs for a project's links (active and archived). */
export function projectOpenTabs(project: Project, open: Map<string, TabLike[]>): { linkIds: string[]; tabs: TabLike[] } {
  const linkIds = project.linkIds.filter((id) => open.has(id));
  return { linkIds, tabs: linkIds.flatMap((id) => open.get(id)!) };
}

/** Which of the given tabs "Close open tabs" closes, and how many it skips (pinned or audible). */
export function closableTabs(tabs: TabLike[]): { close: TabLike[]; skipped: number } {
  const close = tabs.filter((t) => !isProtected(t));
  return { close, skipped: tabs.length - close.length };
}
