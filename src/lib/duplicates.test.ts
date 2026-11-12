import { describe, expect, it } from 'vitest';
import { findDuplicates, tabsToClose } from './duplicates';
import type { TabLike } from './tabs';

const tab = (id: number, url: string, extra: Partial<TabLike> = {}): TabLike => ({ id, windowId: 1, url, ...extra });

describe('findDuplicates', () => {
  it('keeps the most recently accessed tab across windows', () => {
    const groups = findDuplicates([
      tab(1, 'https://a.com/x', { lastAccessed: 100 }),
      tab(2, 'https://a.com/x#frag', { lastAccessed: 300, windowId: 2 }),
      tab(3, 'https://a.com/x?utm_source=y', { lastAccessed: 200 }),
      tab(4, 'https://b.com/'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.map((t) => t.id)).toEqual([2]);
    expect(tabsToClose(groups).map((t) => t.id).sort()).toEqual([1, 3]);
  });
  it('prefers the active tab', () => {
    const groups = findDuplicates([tab(1, 'https://a.com', { lastAccessed: 500 }), tab(2, 'https://a.com', { active: true, lastAccessed: 1 })]);
    expect(groups[0].keep[0].id).toBe(2);
  });
  it('never closes pinned or audible tabs', () => {
    const groups = findDuplicates([
      tab(1, 'https://a.com', { pinned: true, lastAccessed: 1 }),
      tab(2, 'https://a.com', { audible: true, lastAccessed: 2 }),
      tab(3, 'https://a.com', { lastAccessed: 999 }),
    ]);
    expect(groups[0].keep.map((t) => t.id).sort()).toEqual([1, 2]);
    expect(groups[0].close.map((t) => t.id)).toEqual([3]);
  });
  it('ignores non-web tabs', () => {
    expect(findDuplicates([tab(1, 'chrome://newtab/'), tab(2, 'chrome://newtab/')])).toEqual([]);
  });
});
