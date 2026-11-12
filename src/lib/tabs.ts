/** The subset of chrome.tabs.Tab the pure logic needs — easy to build in tests. */
export interface TabLike {
  id: number;
  windowId: number;
  url: string;
  title?: string;
  favIconUrl?: string;
  pinned?: boolean;
  audible?: boolean;
  active?: boolean;
  index?: number;
  groupId?: number;
  /** ms since epoch; Chrome 121+. */
  lastAccessed?: number;
}

/** Tabs the extension must never close automatically. */
export function isProtected(tab: TabLike): boolean {
  return !!tab.pinned || !!tab.audible;
}

export function toTabLike(tab: chrome.tabs.Tab): TabLike | null {
  if (tab.id === undefined || tab.id < 0) return null;
  const url = tab.url || tab.pendingUrl;
  if (!url) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    pinned: tab.pinned,
    audible: tab.audible,
    active: tab.active,
    index: tab.index,
    groupId: tab.groupId,
    lastAccessed: (tab as { lastAccessed?: number }).lastAccessed,
  };
}
