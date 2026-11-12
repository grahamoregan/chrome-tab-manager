import { describe, expect, it } from 'vitest';
import { planGather, summariseSites, scatteredSites, siteLabel } from './sites';
import type { TabLike } from './tabs';

const tab = (id: number, windowId: number, url: string, extra: Partial<TabLike> = {}): TabLike => ({ id, windowId, url, ...extra });

const tabs = [
  tab(1, 1, 'https://www.linkedin.com/feed'),
  tab(2, 2, 'https://uk.linkedin.com/in/a'),
  tab(3, 2, 'https://www.linkedin.com/posts/b'),
  tab(4, 1, 'https://github.com/x'),
  tab(5, 3, 'https://linkedin.com/jobs', { pinned: true }),
];

describe('sites', () => {
  it('summarises by registrable domain', () => {
    const s = summariseSites(tabs);
    expect(s[0].site).toBe('linkedin.com');
    expect(s[0].count).toBe(4);
    expect(scatteredSites(tabs).map((x) => x.site)).toEqual(['linkedin.com']);
  });
  it('targets the window with the most tabs and never moves pinned tabs', () => {
    const plan = planGather(tabs, 'linkedin.com', 1)!;
    expect(plan.targetWindowId).toBe(2);
    expect(plan.move.map((t) => t.id)).toEqual([1]);
    expect(plan.all.map((t) => t.id).sort()).toEqual([1, 2, 3]);
  });
  it('breaks ties with the current window', () => {
    const t = [tab(1, 1, 'https://a.com'), tab(2, 2, 'https://a.com/b')];
    expect(planGather(t, 'a.com', 2)!.targetWindowId).toBe(2);
    expect(planGather(t, 'a.com', 1)!.targetWindowId).toBe(1);
  });
  it('labels sites', () => {
    expect(siteLabel('linkedin.com')).toBe('linkedin');
    expect(siteLabel('bbc.co.uk')).toBe('bbc');
    expect(siteLabel('127.0.0.1')).toBe('127.0.0.1');
  });
});
