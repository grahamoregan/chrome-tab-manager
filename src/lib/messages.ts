/** Typed messages from the manager to the background service worker. */
import type { ClosedTab } from './storage';

export type Request =
  | { type: 'closeTabs'; tabIds: number[]; reason: string; label: string }
  | { type: 'gatherSite'; site: string; currentWindowId?: number }
  | { type: 'tidyAll'; currentWindowId?: number }
  | { type: 'mergeWindows'; windowIds: number[]; currentWindowId?: number }
  | { type: 'saveEverything'; perWindow: boolean }
  | { type: 'saveTabsToProject'; tabIds: number[]; target: { projectId: string } | { newName: string } }
  | { type: 'openProject'; projectId: string }
  | { type: 'openUrlsInNewWindow'; urls: string[] }
  | { type: 'focusOrOpen'; url: string }
  | { type: 'reopenTabs'; tabs: ClosedTab[] }
  | { type: 'undo' }
  | { type: 'openManager' };

export type Response = { ok: true; result: unknown } | { ok: false; error: string };

export async function send<T = unknown>(req: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as Response | undefined;
  if (!res) throw new Error('No response from background');
  if (!res.ok) throw new Error(res.error);
  return res.result as T;
}
