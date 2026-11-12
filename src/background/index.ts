import {
  closeTabs,
  focusOrOpen,
  gatherSite,
  mergeWindows,
  openManager,
  openProject,
  openUrlsInNewWindow,
  reopenTabs,
  saveEverything,
  saveTabsToProject,
  tidyAll,
  undoLast,
} from '../lib/actions';
import type { Request, Response } from '../lib/messages';
import { addLinks, createProject, sortedProjects } from '../lib/model';
import { loadData, onStorageChange, updateData } from '../lib/storage';
import { getThumbnail, pruneThumbnails, putThumbnail, shrinkCapture } from '../lib/thumbnails';
import { isWebUrl, normaliseUrl } from '../lib/url';

// ---------- Messages ----------

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case 'closeTabs':
      return closeTabs(req.tabIds, req.reason, req.label);
    case 'gatherSite':
      return gatherSite(req.site, req.currentWindowId);
    case 'tidyAll':
      return tidyAll(req.currentWindowId);
    case 'mergeWindows':
      return mergeWindows(req.windowIds, req.currentWindowId);
    case 'saveEverything':
      return saveEverything(req.perWindow);
    case 'saveTabsToProject':
      return saveTabsToProject(req.tabIds, req.target);
    case 'openProject':
      return openProject(req.projectId);
    case 'openUrlsInNewWindow':
      return openUrlsInNewWindow(req.urls);
    case 'focusOrOpen':
      return focusOrOpen(req.url);
    case 'reopenTabs':
      return reopenTabs(req.tabs);
    case 'undo':
      return undoLast();
    case 'openManager':
      return (await openManager()).id;
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse: (r: Response) => void) => {
  handle(req)
    .then((result) => sendResponse({ ok: true, result: result ?? null }))
    .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true; // async response
});

// No popup: the toolbar icon opens (or focuses) the manager.
chrome.action.onClicked.addListener(() => void openManager());

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-manager') void openManager();
});

// ---------- Thumbnails ----------

const RECAPTURE_AFTER_MS = 30 * 60_000;
const PRUNE_UNSAVED_AFTER_MS = 3 * 24 * 60 * 60_000;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let lastCaptureAt = 0;

function scheduleCapture(windowId: number, tabId: number): void {
  clearTimeout(timers.get(windowId));
  timers.set(
    windowId,
    setTimeout(() => {
      timers.delete(windowId);
      void capture(windowId, tabId);
    }, 1200),
  );
}

async function capture(windowId: number, tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || tab.windowId !== windowId || tab.status !== 'complete' || !isWebUrl(tab.url)) return;
    const win = await chrome.windows.get(windowId);
    if (win.state === 'minimized' || win.incognito) return;
    const id = normaliseUrl(tab.url);
    const existing = await getThumbnail(id);
    if (existing && Date.now() - existing.capturedAt < RECAPTURE_AFTER_MS) return;
    // Chrome allows ~2 captures per second.
    const wait = 600 - (Date.now() - lastCaptureAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCaptureAt = Date.now();
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 });
    // Make sure the user didn't switch tabs while we were capturing.
    const still = await chrome.tabs.get(tabId);
    if (!still.active || normaliseUrl(still.url ?? '') !== id) return;
    await putThumbnail({ id, blob: await shrinkCapture(dataUrl), capturedAt: Date.now() });
  } catch {
    // Pages like the Chrome Web Store or PDFs can't be captured — ignore.
  }
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => scheduleCapture(windowId, tabId));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) scheduleCapture(tab.windowId, tabId);
});

async function prune(): Promise<void> {
  const data = await loadData();
  await pruneThumbnails(new Set(Object.keys(data.links)), PRUNE_UNSAVED_AFTER_MS).catch(() => 0);
}

// ---------- Context menus ----------

const MENU_ROOT = 'tabsort-root';
const MENU_NEW = 'tabsort-new';
const MENU_PROJECT_PREFIX = 'tabsort-p:';
const MAX_MENU_PROJECTS = 25;

let menuBuild = Promise.resolve();

function rebuildMenus(): Promise<void> {
  menuBuild = menuBuild.then(async () => {
    await chrome.contextMenus.removeAll();
    const contexts: ['page', 'link'] = ['page', 'link'];
    chrome.contextMenus.create({ id: MENU_ROOT, title: 'Add to Tab Sort project', contexts });
    const projects = sortedProjects(await loadData(), 'recent').slice(0, MAX_MENU_PROJECTS);
    for (const p of projects) {
      chrome.contextMenus.create({ id: MENU_PROJECT_PREFIX + p.id, parentId: MENU_ROOT, title: p.name, contexts });
    }
    if (projects.length) chrome.contextMenus.create({ id: 'tabsort-sep', parentId: MENU_ROOT, type: 'separator', contexts });
    chrome.contextMenus.create({ id: MENU_NEW, parentId: MENU_ROOT, title: 'New project from this…', contexts });
  });
  return menuBuild;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  const link = info.linkUrl
    ? { url: info.linkUrl, title: info.selectionText || info.linkUrl }
    : { url: info.pageUrl || tab?.url || '', title: tab?.title, favIconUrl: tab?.favIconUrl };
  if (!isWebUrl(link.url)) return;
  if (id === MENU_NEW) {
    void updateData((d) => createProject(d, link.title || link.url, [link]).data);
  } else if (id.startsWith(MENU_PROJECT_PREFIX)) {
    const projectId = id.slice(MENU_PROJECT_PREFIX.length);
    void updateData((d) => addLinks(d, projectId, [link]));
  }
});

// ---------- Lifecycle ----------

chrome.runtime.onInstalled.addListener(() => {
  void rebuildMenus();
  void prune();
});
chrome.runtime.onStartup.addListener(() => {
  void rebuildMenus();
  void prune();
});
onStorageChange(['data'], () => void rebuildMenus());
