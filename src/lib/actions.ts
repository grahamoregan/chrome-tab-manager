/**
 * Operations that touch Chrome tabs/windows. These run in the background
 * service worker (see messages.ts) so they finish even if the manager tab moves or closes.
 */
import { addLinks, createProject, isUnsorted, markSession, sortedLinkIds, type Data, type LinkInput } from './model';
import { planGather, scatteredSites, siteLabel } from './sites';
import {
  loadData,
  loadSettings,
  recordClosed,
  saveData,
  getUndo,
  setUndo,
  updateData,
  type ClosedTab,
  type TabMove,
  type UndoEntry,
} from './storage';
import { toTabLike, type TabLike } from './tabs';
import { planMerge, planSplit } from './windows';
import { isWebUrl, normaliseUrl } from './url';

export const MANAGER_PATH = 'src/manager/index.html';

export function managerUrl(hash = ''): string {
  return chrome.runtime.getURL(MANAGER_PATH) + hash;
}

export function isManagerUrl(url: string | undefined): boolean {
  return !!url && url.startsWith(chrome.runtime.getURL(MANAGER_PATH));
}

export async function getTabs(): Promise<TabLike[]> {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  return tabs.map(toTabLike).filter((t): t is TabLike => t !== null);
}

export async function openManager(): Promise<chrome.tabs.Tab> {
  const [existing] = await chrome.tabs.query({ url: `${chrome.runtime.getURL(MANAGER_PATH)}*` });
  if (existing?.id !== undefined) {
    await chrome.windows.update(existing.windowId, { focused: true });
    return chrome.tabs.update(existing.id, { active: true }) as Promise<chrome.tabs.Tab>;
  }
  return chrome.tabs.create({ url: managerUrl() });
}

function toClosed(tab: TabLike, reason: string, now: number): ClosedTab {
  return { url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl, windowId: tab.windowId, index: tab.index, closedAt: now, reason };
}

/** Closes the given tabs (if still open), records them and makes them undoable. */
export async function closeTabs(tabIds: number[], reason: string, label: string, extraUndo: Partial<UndoEntry> = {}): Promise<number> {
  const wanted = new Set(tabIds);
  const tabs = (await getTabs()).filter((t) => wanted.has(t.id));
  if (tabs.length === 0) return 0;
  const now = Date.now();
  const closed = tabs.map((t) => toClosed(t, reason, now));
  await recordClosed(closed);
  await setUndo({ label, at: now, closedTabs: closed, ...extraUndo });
  await chrome.tabs.remove(tabs.map((t) => t.id));
  return tabs.length;
}

async function waitForUrl(tabId: number, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) return;
    if (t.url && !t.pendingUrl) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Creates a background tab and discards it once its URL is committed, so it doesn't stay loaded. */
async function createLazyTab(windowId: number, url: string, index?: number): Promise<void> {
  const tab = await chrome.tabs.create({ windowId, url, active: false, index });
  if (tab.id === undefined) return;
  await waitForUrl(tab.id);
  await chrome.tabs.discard(tab.id).catch(() => undefined);
}

/** Reopens tabs into their original windows where those still exist, otherwise into new windows. */
export async function reopenTabs(closed: ClosedTab[], lazy = closed.length > 5): Promise<void> {
  const windows = new Set((await chrome.windows.getAll({ windowTypes: ['normal'] })).map((w) => w.id));
  const byWindow = new Map<number, ClosedTab[]>();
  for (const t of closed) {
    const list = byWindow.get(t.windowId) ?? [];
    list.push(t);
    byWindow.set(t.windowId, list);
  }
  for (const [windowId, list] of byWindow) {
    list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    let target = windowId;
    let rest = list;
    if (!windows.has(windowId)) {
      const w = await chrome.windows.create({ url: list[0].url, focused: false });
      if (w?.id === undefined) continue;
      target = w.id;
      rest = list.slice(1);
    }
    for (const t of rest) {
      if (lazy) await createLazyTab(target, t.url, t.index);
      else await chrome.tabs.create({ windowId: target, url: t.url, active: false, index: t.index });
    }
  }
}

export async function undoLast(): Promise<string | null> {
  const entry = await getUndo();
  if (!entry) return null;
  await setUndo(null);
  if (entry.dataBefore) await saveData(entry.dataBefore);
  if (entry.moves?.length) await moveBack(entry.moves);
  if (entry.closedTabs?.length) await reopenTabs(entry.closedTabs);
  return entry.label;
}

/**
 * Returns moved tabs to their original windows and positions. A window that
 * closed because all its tabs moved out is recreated from its first tab.
 */
async function moveBack(moves: TabMove[]): Promise<void> {
  const open = new Set((await chrome.windows.getAll()).map((w) => w.id));
  const byWindow = new Map<number, TabMove[]>();
  for (const m of moves) byWindow.set(m.windowId, [...(byWindow.get(m.windowId) ?? []), m]);
  for (const [windowId, list] of byWindow) {
    list.sort((a, b) => a.index - b.index);
    let target = windowId;
    let rest = list;
    if (!open.has(windowId)) {
      const w = await chrome.windows.create({ tabId: list[0].tabId, focused: false }).catch(() => undefined);
      if (w?.id === undefined) continue;
      target = w.id;
      rest = list.slice(1);
    }
    // Ascending order so each tab lands at its original index.
    for (const m of rest) {
      await chrome.tabs.move(m.tabId, { windowId: target, index: m.index }).catch(() => undefined);
    }
    for (const m of list) if (m.pinned) await chrome.tabs.update(m.tabId, { pinned: true }).catch(() => undefined);
  }
}

/** Moves every tab of the selected windows into the selected window with the most tabs. */
export async function mergeWindows(windowIds: number[], currentWindowId?: number): Promise<{ moved: number; targetWindowId: number } | null> {
  const plan = planMerge(await getTabs(), windowIds, currentWindowId);
  if (!plan) return null;
  const moves: TabMove[] = plan.moving.map((t) => ({ tabId: t.id, windowId: t.windowId, index: t.index ?? 0, pinned: t.pinned }));
  for (const source of plan.sourceWindowIds) {
    // Whole groups first so they keep their title and colour.
    for (const g of await chrome.tabGroups.query({ windowId: source })) {
      await chrome.tabGroups.move(g.id, { windowId: plan.targetWindowId, index: -1 });
    }
    const remaining = (await chrome.tabs.query({ windowId: source })).sort((a, b) => a.index - b.index);
    const pinned = remaining.filter((t) => t.pinned);
    const unpinned = remaining.filter((t) => !t.pinned);
    if (pinned.length) {
      // Pinned tabs go after the target's existing pinned tabs.
      const targetPinned = (await chrome.tabs.query({ windowId: plan.targetWindowId, pinned: true })).length;
      await chrome.tabs.move(pinned.map((t) => t.id!) as [number, ...number[]], { windowId: plan.targetWindowId, index: targetPinned });
      for (const t of pinned) await chrome.tabs.update(t.id!, { pinned: true });
    }
    if (unpinned.length) {
      await chrome.tabs.move(unpinned.map((t) => t.id!) as [number, ...number[]], { windowId: plan.targetWindowId, index: -1 });
    }
  }
  const n = plan.sourceWindowIds.length + 1;
  await setUndo({ label: `Merged ${n} windows (${plural(moves.length, 'tab')} moved)`, at: Date.now(), moves });
  await chrome.windows.update(plan.targetWindowId, { focused: true }).catch(() => undefined);
  return { moved: moves.length, targetWindowId: plan.targetWindowId };
}

/**
 * Splits one window into windows of at most `size` tabs (see planSplit). New windows open
 * in the background. Returns the new window ids, or null if the window already fits.
 */
export async function splitWindow(windowId: number, size: number): Promise<{ newWindowIds: number[]; moved: number } | null> {
  const plan = planSplit(await getTabs(), windowId, size, (t) => isManagerUrl(t.url));
  if (!plan) return null;
  const moves: TabMove[] = plan.moving.map((t) => ({ tabId: t.id, windowId: t.windowId, index: t.index ?? 0 }));
  const newWindowIds: number[] = [];
  for (const units of plan.newWindows) {
    // Start with a blank tab so a grouped first tab isn't pulled out of its group; removed below.
    const w = await chrome.windows.create({ focused: false });
    if (w?.id === undefined) continue;
    const placeholder = w.tabs?.[0]?.id;
    newWindowIds.push(w.id);
    for (const u of units) {
      if (u.groupId !== undefined) {
        await chrome.tabGroups.move(u.groupId, { windowId: w.id, index: -1 });
      } else {
        await chrome.tabs.move(u.tabs.map((t) => t.id) as [number, ...number[]], { windowId: w.id, index: -1 });
      }
    }
    if (placeholder !== undefined) await chrome.tabs.remove(placeholder).catch(() => undefined);
  }
  await setUndo({
    label: `Split a window of ${plan.keep.length + plan.moving.length} tabs into ${newWindowIds.length + 1}`,
    at: Date.now(),
    moves,
  });
  return { newWindowIds, moved: moves.length };
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/** Pulls every tab of `site` into the window with the most of them. Returns the moves made. */
async function gatherOne(tabs: TabLike[], site: string, currentWindowId: number | undefined, group: boolean): Promise<TabMove[]> {
  const plan = planGather(tabs, site, currentWindowId);
  if (!plan) return [];
  const moves: TabMove[] = plan.move.map((t) => ({ tabId: t.id, windowId: t.windowId, index: t.index ?? 0 }));
  if (plan.move.length) {
    await chrome.tabs.move(plan.move.map((t) => t.id), { windowId: plan.targetWindowId, index: -1 });
  }
  if (group) {
    const title = siteLabel(site);
    const [existing] = await chrome.tabGroups.query({ windowId: plan.targetWindowId, title });
    const movedIds = new Set(plan.move.map((t) => t.id));
    // Don't pull tabs out of groups the user made themselves.
    const toGroup = plan.all
      .filter((t) => movedIds.has(t.id) || t.groupId === undefined || t.groupId === -1 || t.groupId === existing?.id)
      .map((t) => t.id);
    if (toGroup.length > 0 && (toGroup.length > 1 || existing)) {
      const tabIds = toGroup as [number, ...number[]];
      if (existing) {
        await chrome.tabs.group({ groupId: existing.id, tabIds });
      } else {
        const groupId = await chrome.tabs.group({ createProperties: { windowId: plan.targetWindowId }, tabIds });
        await chrome.tabGroups.update(groupId, { title, collapsed: false });
      }
    }
  }
  return moves;
}

export async function gatherSite(site: string, currentWindowId?: number): Promise<number> {
  const settings = await loadSettings();
  const moves = await gatherOne(await getTabs(), site, currentWindowId, settings.groupGathered);
  if (moves.length) await setUndo({ label: `Gathered ${moves.length} ${site} tabs`, at: Date.now(), moves });
  return moves.length;
}

export async function tidyAll(currentWindowId?: number): Promise<number> {
  const settings = await loadSettings();
  const all: TabMove[] = [];
  for (const s of scatteredSites(await getTabs())) {
    // Re-read tabs each time: earlier moves change window counts.
    all.push(...(await gatherOne(await getTabs(), s.site, currentWindowId, settings.groupGathered)));
  }
  if (all.length) await setUndo({ label: `Tidied ${all.length} tabs by site`, at: Date.now(), moves: all });
  return all.length;
}

function tabInput(t: TabLike): LinkInput {
  return { url: t.url, title: t.title, favIconUrl: t.favIconUrl };
}

function stamp(now = new Date()): string {
  return now.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Saves every web tab into a project (or one per window) and closes all
 * unpinned tabs except the manager. Undo reopens the tabs and removes the
 * new project(s).
 */
export async function saveEverything(perWindow: boolean): Promise<{ saved: number; closed: number }> {
  const manager = await openManager();
  const tabs = (await getTabs()).filter((t) => !isManagerUrl(t.url));
  const dataBefore = await loadData();
  // Tabs already in a project are safe: close them without saving them again.
  const alreadySaved = sortedLinkIds(dataBefore);
  const web = tabs.filter((t) => isWebUrl(t.url) && isUnsorted(t.url, alreadySaved));
  const when = stamp();

  let data: Data = dataBefore;
  if (perWindow) {
    const windowIds = [...new Set(web.map((t) => t.windowId))].sort((a, b) => a - b);
    windowIds.forEach((wid, i) => {
      const r = createProject(data, `Saved session – ${when} – Window ${i + 1}`, web.filter((t) => t.windowId === wid).map(tabInput));
      data = markSession(r.data, r.projectId);
    });
  } else if (web.length) {
    const r = createProject(data, `Saved session – ${when}`, web.map(tabInput));
    data = markSession(r.data, r.projectId);
  }
  await saveData(data);

  const toClose = tabs.filter((t) => !t.pinned && t.id !== manager.id).map((t) => t.id);
  const saved = new Set(web.map((t) => normaliseUrl(t.url))).size;
  const closed = await closeTabs(toClose, 'Save everything & close', `Saved ${saved} and closed ${toClose.length} tabs`, { dataBefore });
  return { saved, closed };
}

export async function saveTabsToProject(tabIds: number[], target: { projectId: string } | { newName: string }): Promise<string> {
  const ids = new Set(tabIds);
  const inputs = (await getTabs()).filter((t) => ids.has(t.id) && isWebUrl(t.url)).map(tabInput);
  let projectId = '';
  await updateData((d) => {
    if ('projectId' in target) {
      projectId = target.projectId;
      return addLinks(d, target.projectId, inputs);
    }
    const r = createProject(d, target.newName, inputs);
    projectId = r.projectId;
    return r.data;
  });
  return projectId;
}

/** Opens the URLs in a new window, skipping any already open. Returns how many were opened. */
export async function openUrlsInNewWindow(urls: string[], skipOpen = true): Promise<number> {
  let list = urls.filter(isWebUrl);
  if (skipOpen) {
    const open = new Set((await getTabs()).map((t) => normaliseUrl(t.url)));
    list = list.filter((u) => !open.has(normaliseUrl(u)));
  }
  if (list.length === 0) return 0;
  const w = await chrome.windows.create({ url: list[0], focused: true });
  if (w?.id === undefined) return 0;
  for (const u of list.slice(1)) await createLazyTab(w.id, u);
  return list.length;
}

export async function openProject(projectId: string): Promise<number> {
  const data = await loadData();
  const p = data.projects[projectId];
  if (!p) return 0;
  const done = new Set(p.doneIds ?? []);
  return openUrlsInNewWindow(
    p.linkIds
      .filter((id) => !done.has(id))
      .map((id) => data.links[id]?.url)
      .filter((u): u is string => !!u),
  );
}

/** Focuses an open tab with this URL, or opens it in the last focused window. */
export async function focusOrOpen(url: string): Promise<void> {
  const key = normaliseUrl(url);
  const match = (await getTabs()).find((t) => normaliseUrl(t.url) === key);
  if (match) {
    await chrome.windows.update(match.windowId, { focused: true });
    await chrome.tabs.update(match.id, { active: true });
    return;
  }
  await chrome.tabs.create({ url, active: true });
}
