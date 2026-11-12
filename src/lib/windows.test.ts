import { describe, expect, it } from 'vitest';
import type { TabLike } from './tabs';
import { planMerge } from './windows';

const tab = (id: number, windowId: number, extra: Partial<TabLike> = {}): TabLike => ({ id, windowId, url: `https://a.com/${id}`, ...extra });
const tabs = [tab(1, 10), tab(2, 10), tab(3, 20), tab(4, 20), tab(5, 20, { pinned: true }), tab(6, 30), tab(7, 40)];

describe('planMerge', () => {
  it('merges into the selected window with the most tabs, moving every tab including pinned', () => {
    const plan = planMerge(tabs, [10, 20, 30])!;
    expect(plan.targetWindowId).toBe(20);
    expect(plan.sourceWindowIds).toEqual([10, 30]);
    expect(plan.moving.map((t) => t.id)).toEqual([1, 2, 6]);
  });
  it('ignores windows that were not selected', () => {
    expect(planMerge(tabs, [10, 30])!.moving.map((t) => t.id)).toEqual([6]);
  });
  it('breaks ties with the current window, then the lowest id', () => {
    expect(planMerge(tabs, [30, 40], 40)!.targetWindowId).toBe(40);
    expect(planMerge(tabs, [30, 40])!.targetWindowId).toBe(30);
  });
  it('needs at least two windows with tabs', () => {
    expect(planMerge(tabs, [10])).toBeNull();
    expect(planMerge(tabs, [10, 99])).toBeNull();
  });
});
