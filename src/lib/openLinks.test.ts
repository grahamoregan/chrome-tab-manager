import { describe, expect, it } from 'vitest';
import { createProject, emptyData, setDone } from './model';
import { closableTabs, openTabsByLink, projectOpenTabs } from './openLinks';
import type { TabLike } from './tabs';

const tab = (id: number, url: string, extra: Partial<TabLike> = {}): TabLike => ({ id, windowId: 1, url, ...extra });

describe('open tabs for links', () => {
  it('groups tabs by normalised url, most recently viewed first, skipping the manager', () => {
    const m = openTabsByLink(
      [
        tab(1, 'https://x.com/a#top', { lastAccessed: 10 }),
        tab(2, 'https://x.com/a?utm_source=q', { lastAccessed: 30 }),
        tab(3, 'chrome-extension://abc/src/manager/index.html'),
      ],
      (u) => u.startsWith('chrome-extension://'),
    );
    expect([...m.keys()]).toEqual(['https://x.com/a']);
    expect(m.get('https://x.com/a')!.map((t) => t.id)).toEqual([2, 1]);
  });

  it('finds open tabs for active and archived links in a project', () => {
    let { data, projectId } = createProject(emptyData(), 'P', [
      { url: 'https://x.com/a' },
      { url: 'https://x.com/b' },
      { url: 'https://x.com/c' },
    ], 1, 'p');
    data = setDone(data, projectId, ['https://x.com/b'], true);
    const open = openTabsByLink([tab(1, 'https://x.com/b'), tab(2, 'https://x.com/c'), tab(3, 'https://x.com/c'), tab(4, 'https://y.com/')]);
    const r = projectOpenTabs(data.projects[projectId], open);
    expect(r.linkIds).toEqual(['https://x.com/b', 'https://x.com/c']);
    expect(r.tabs.map((t) => t.id).sort()).toEqual([1, 2, 3]);
  });

  it('never closes pinned or audible tabs', () => {
    const r = closableTabs([tab(1, 'a', { pinned: true }), tab(2, 'b', { audible: true }), tab(3, 'c')]);
    expect(r.close.map((t) => t.id)).toEqual([3]);
    expect(r.skipped).toBe(2);
  });
});
