import { emptyData, type Data, type ProjectSort } from './model';
import { DEFAULT_FEED_RULES, DEFAULT_STALE_MINUTES, type FeedRule } from './staleFeeds';

export interface Settings {
  feedRules: FeedRule[];
  staleMinutes: number;
  groupGathered: boolean;
  projectSort: ProjectSort;
}

export const DEFAULT_SETTINGS: Settings = {
  feedRules: DEFAULT_FEED_RULES,
  staleMinutes: DEFAULT_STALE_MINUTES,
  groupGathered: true,
  projectSort: 'recent',
};

export interface ClosedTab {
  url: string;
  title?: string;
  favIconUrl?: string;
  windowId: number;
  index?: number;
  closedAt: number;
  reason: string;
}

export interface TabMove {
  tabId: number;
  windowId: number;
  index: number;
  /** Chrome unpins tabs that move between windows, so pinned state is restored explicitly. */
  pinned?: boolean;
}

/** The single most recent undoable action. */
export interface UndoEntry {
  label: string;
  at: number;
  closedTabs?: ClosedTab[];
  dataBefore?: Data;
  moves?: TabMove[];
}

const KEYS = {
  data: 'data',
  settings: 'settings',
  undo: 'undo',
  recentlyClosed: 'recentlyClosed',
} as const;

export const RECENTLY_CLOSED_LIMIT = 300;

async function get<T>(key: string): Promise<T | undefined> {
  const r = await chrome.storage.local.get(key);
  return r[key] as T | undefined;
}

async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function loadData(): Promise<Data> {
  return (await get<Data>(KEYS.data)) ?? emptyData();
}

export async function saveData(data: Data): Promise<void> {
  await set(KEYS.data, data);
}

/**
 * Read-modify-write of the project data. Records the previous state as the
 * undo entry when `undoLabel` is given.
 */
export async function updateData(fn: (d: Data) => Data, undoLabel?: string): Promise<Data> {
  const before = await loadData();
  const after = fn(before);
  if (after === before) return before;
  await saveData(after);
  if (undoLabel) await setUndo({ label: undoLabel, at: Date.now(), dataBefore: before });
  return after;
}

export async function loadSettings(): Promise<Settings> {
  const s = await get<Partial<Settings>>(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await set(KEYS.settings, next);
  return next;
}

export async function getUndo(): Promise<UndoEntry | undefined> {
  return get<UndoEntry>(KEYS.undo);
}

export async function setUndo(entry: UndoEntry | null): Promise<void> {
  if (entry) await set(KEYS.undo, entry);
  else await chrome.storage.local.remove(KEYS.undo);
}

export async function getRecentlyClosed(): Promise<ClosedTab[]> {
  return (await get<ClosedTab[]>(KEYS.recentlyClosed)) ?? [];
}

export async function recordClosed(tabs: ClosedTab[]): Promise<void> {
  const list = [...tabs, ...(await getRecentlyClosed())].slice(0, RECENTLY_CLOSED_LIMIT);
  await set(KEYS.recentlyClosed, list);
}

export async function removeFromRecentlyClosed(closedAt: number, url: string): Promise<void> {
  const list = (await getRecentlyClosed()).filter((t) => !(t.closedAt === closedAt && t.url === url));
  await set(KEYS.recentlyClosed, list);
}

export async function clearRecentlyClosed(): Promise<void> {
  await set(KEYS.recentlyClosed, []);
}

/** Subscribe to changes in any of our storage keys. Returns an unsubscribe function. */
export function onStorageChange(keys: (keyof typeof KEYS)[], cb: () => void): () => void {
  const names = new Set<string>(keys.map((k) => KEYS[k]));
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && Object.keys(changes).some((k) => names.has(k))) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
