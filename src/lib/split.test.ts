import { describe, expect, it } from 'vitest';
import { clampSplitSize, planSplit } from './windows';
import type { TabLike } from './tabs';

const win = (n: number, extra: (i: number) => Partial<TabLike> = () => ({})): TabLike[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, windowId: 1, index: i, url: `https://x.com/${i}`, ...extra(i) }));
const sizes = (p: ReturnType<typeof planSplit>) => p && [p.keep.length, ...p.newWindows.map((w) => w.flatMap((u) => u.tabs).length)];

describe('planSplit', () => {
  it('does nothing when the window fits', () => {
    expect(planSplit(win(80), 1, 80)).toBeNull();
  });

  it('keeps the first tabs and moves the rest in order', () => {
    const p = planSplit(win(230), 1, 80)!;
    expect(sizes(p)).toEqual([80, 80, 70]);
    expect(p.keep.map((t) => t.id)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
    expect(p.newWindows[0][0].tabs[0].id).toBe(81);
    expect(p.moving).toHaveLength(150);
  });

  it('keeps pinned tabs and the manager, counting them towards the first window', () => {
    const tabs = win(12, (i) => ({ pinned: i < 2, url: i === 5 ? 'chrome-extension://m/' : `https://x.com/${i}` }));
    const p = planSplit(tabs, 1, 5, (t) => t.url.startsWith('chrome-extension://'))!;
    expect(p.keep.map((t) => t.id)).toEqual([1, 2, 3, 4, 6]);
    expect(sizes(p)).toEqual([5, 5, 2]);
    expect(p.moving.some((t) => t.pinned || t.id === 6)).toBe(false);
  });

  it('never breaks up a tab group', () => {
    // tabs 4-7 are a group straddling the limit of 5
    const p = planSplit(win(10, (i) => ({ groupId: i >= 3 && i <= 6 ? 9 : -1 })), 1, 5)!;
    expect(sizes(p)).toEqual([3, 5, 2]);
    expect(p.newWindows[0][0]).toEqual(expect.objectContaining({ groupId: 9 }));
    expect(p.newWindows[0][0].tabs.map((t) => t.id)).toEqual([4, 5, 6, 7]);
  });

  it('gives an oversized group a window of its own', () => {
    const p = planSplit(win(12, (i) => ({ groupId: i >= 2 && i < 10 ? 3 : -1 })), 1, 5)!;
    expect(sizes(p)).toEqual([2, 8, 2]);
  });

  it('only looks at the chosen window and clamps the size', () => {
    const tabs = [...win(6), ...win(6).map((t) => ({ ...t, id: t.id + 100, windowId: 2 }))];
    expect(sizes(planSplit(tabs, 2, 5))).toEqual([5, 1]);
    expect(clampSplitSize(1)).toBe(5);
    expect(clampSplitSize(9999)).toBe(500);
    expect(clampSplitSize(NaN)).toBe(80);
  });
});
