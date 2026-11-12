import { useCallback, useEffect, useRef, useState } from 'react';
import { getTabs } from '../lib/actions';
import { emptyData, type Data } from '../lib/model';
import {
  DEFAULT_SETTINGS,
  getRecentlyClosed,
  getUndo,
  loadData,
  loadSettings,
  onStorageChange,
  type ClosedTab,
  type Settings,
  type UndoEntry,
} from '../lib/storage';
import type { TabLike } from '../lib/tabs';
import { getThumbnail } from '../lib/thumbnails';

export interface LiveTabs {
  tabs: TabLike[];
  windowIds: number[];
  currentWindowId?: number;
  loaded: boolean;
}

/** All open tabs, refreshed whenever tabs or windows change. */
export function useLiveTabs(): LiveTabs {
  const [state, setState] = useState<LiveTabs>({ tabs: [], windowIds: [], loaded: false });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const refresh = async () => {
      const [tabs, windows, current] = await Promise.all([
        getTabs(),
        chrome.windows.getAll({ windowTypes: ['normal'] }),
        chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => undefined),
      ]);
      if (cancelled) return;
      const windowIds = windows.map((w) => w.id).filter((id): id is number => id !== undefined).sort((a, b) => a - b);
      setState({ tabs, windowIds, currentWindowId: current?.id, loaded: true });
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    void refresh();
    const events = [
      chrome.tabs.onCreated,
      chrome.tabs.onRemoved,
      chrome.tabs.onUpdated,
      chrome.tabs.onMoved,
      chrome.tabs.onAttached,
      chrome.tabs.onDetached,
      chrome.tabs.onActivated,
      chrome.windows.onCreated,
      chrome.windows.onRemoved,
      chrome.windows.onFocusChanged,
    ] as chrome.events.Event<() => void>[];
    events.forEach((e) => e.addListener(schedule));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      events.forEach((e) => e.removeListener(schedule));
    };
  }, []);
  return state;
}

function useStored<T>(load: () => Promise<T>, initial: T, keys: Parameters<typeof onStorageChange>[0]): T {
  const [value, setValue] = useState<T>(initial);
  const loadRef = useRef(load);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => void loadRef.current().then((v) => !cancelled && setValue(v));
    refresh();
    const off = onStorageChange(keys, refresh);
    return () => {
      cancelled = true;
      off();
    };
  }, []);
  return value;
}

export const useData = (): Data => useStored(loadData, emptyData(), ['data']);
export const useSettings = (): Settings => useStored(loadSettings, DEFAULT_SETTINGS, ['settings']);
export const useUndo = (): UndoEntry | undefined => useStored(getUndo, undefined, ['undo']);
export const useRecentlyClosed = (): ClosedTab[] => useStored(getRecentlyClosed, [], ['recentlyClosed']);

/** Object URL for a link's thumbnail, or null. */
export function useThumbnail(id: string, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void getThumbnail(id)
      .then((t) => {
        if (cancelled || !t) return;
        objectUrl = URL.createObjectURL(t.blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, enabled]);
  return url;
}

/** Runs an async action, exposing busy state and the last error. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
