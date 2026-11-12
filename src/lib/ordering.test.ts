import { describe, expect, it } from 'vitest';
import {
  addLinks, copyLinks, createProject, emptyData, moveLinks, moveToBottom, moveToTop, nudgeLinks,
  orderedLinks, removeLinks, reorderLinks, setDone, setSort, type Data,
} from './model';

const u = (n: string) => `https://site-${n}.com/${n}`;
const ids = (d: Data, p = 'p') => d.projects[p].linkIds.map((id) => id.replace(/^https:\/\/site-(\w)\.com\/\w$/, '$1')).join('');
const active = (d: Data, p = 'p') => orderedLinks(d, d.projects[p]).active.map((l) => l.title).join('');
const done = (d: Data, p = 'p') => orderedLinks(d, d.projects[p]).done.map((l) => l.title).join('');

function setup(): Data {
  let d = createProject(emptyData(), 'P', ['a', 'b', 'c', 'd', 'e'].map((n) => ({ url: u(n), title: n })), 100, 'p').data;
  d = createProject(d, 'Q', [], 100, 'q').data;
  return d;
}

describe('manual ordering', () => {
  it('appends new links at the bottom', () => {
    expect(ids(addLinks(setup(), 'p', [{ url: u('f'), title: 'f' }]))).toBe('abcdef');
  });
  it('moves a block before a target, keeping its relative order', () => {
    expect(ids(reorderLinks(setup(), 'p', [u('d'), u('b')], u('a')))).toBe('bdace');
    expect(ids(reorderLinks(setup(), 'p', [u('a')], null))).toBe('bcdea');
    expect(reorderLinks(setup(), 'p', [u('a')], u('a'))).toEqual(setup());
  });
  it('moves to top and bottom', () => {
    expect(ids(moveToTop(setup(), 'p', [u('c'), u('e')]))).toBe('ceabd');
    expect(ids(moveToBottom(setup(), 'p', [u('a'), u('c')]))).toBe('bdeac');
  });
  it('nudges up and down, including at the edges', () => {
    expect(ids(nudgeLinks(setup(), 'p', [u('c')], -1))).toBe('acbde');
    expect(ids(nudgeLinks(setup(), 'p', [u('c')], 1))).toBe('abdce');
    expect(ids(nudgeLinks(setup(), 'p', [u('b'), u('c')], 1))).toBe('adbce');
    expect(ids(nudgeLinks(setup(), 'p', [u('a')], -1))).toBe('abcde');
    expect(ids(nudgeLinks(setup(), 'p', [u('e')], 1))).toBe('abcde');
  });
  it('nudges past done links, which are not in the visible list', () => {
    const d = setDone(setup(), 'p', [u('b')], true);
    expect(ids(nudgeLinks(d, 'p', [u('c')], -1))).toBe('cabde');
  });
  it('switches the project to manual order when reordering', () => {
    const d = setSort(setup(), 'p', 'title');
    expect(d.projects.p.sort).toBe('title');
    expect(moveToTop(d, 'p', [u('e')]).projects.p.sort).toBe('manual');
  });
});

describe('sorting is a view only', () => {
  it('sorts by title, site and date added to this project without changing manual order', () => {
    let d = createProject(emptyData(), 'P', [{ url: 'https://z.com/1', title: 'beta' }, { url: 'https://a.com/1', title: 'alpha' }], 100, 'p').data;
    d = addLinks(d, 'p', [{ url: 'https://m.com/1', title: 'gamma' }], 300);
    expect(active(setSort(d, 'p', 'title'))).toBe('alphabetagamma');
    expect(active(setSort(d, 'p', 'site'))).toBe('alphagammabeta');
    expect(active(setSort(d, 'p', 'newest')).startsWith('gamma')).toBe(true);
    expect(active(setSort(d, 'p', 'oldest')).endsWith('gamma')).toBe(true);
    expect(setSort(d, 'p', 'title').projects.p.linkIds).toEqual(d.projects.p.linkIds);
  });
  it('uses when a link was added to this project, not when it was first saved', () => {
    let d = createProject(emptyData(), 'Old', [{ url: u('a'), title: 'a' }], 100, 'old').data;
    d = createProject(d, 'P', [{ url: u('b'), title: 'b' }], 200, 'p').data;
    d = copyLinks(d, [u('a')], 'p', 300);
    expect(active(setSort(d, 'p', 'newest'))).toBe('ab');
  });
  it('falls back to the link save time for data saved before per-project dates existed', () => {
    const d = setup();
    delete d.projects.p.addedAt;
    d.links[u('c')].addedAt = 999;
    expect(active(setSort(d, 'p', 'newest')).startsWith('c')).toBe(true);
  });
});

describe('done', () => {
  it('splits done links into their own list and back', () => {
    const d = setDone(setup(), 'p', [u('b'), u('d')], true);
    expect(active(d)).toBe('ace');
    expect(done(d)).toBe('bd');
    expect(active(setDone(d, 'p', [u('b')], false))).toBe('abce');
  });
  it('is per project and not carried by copy or move', () => {
    const d = setDone(setup(), 'p', [u('b')], true);
    expect(copyLinks(d, [u('b')], 'q').projects.q.doneIds ?? []).toEqual([]);
    const moved = moveLinks(d, [u('b')], 'p', 'q');
    expect(moved.projects.p.doneIds).toEqual([]);
    expect(moved.projects.q.doneIds ?? []).toEqual([]);
  });
  it('forgets done state when a link is removed', () => {
    const d = removeLinks(setDone(setup(), 'p', [u('b')], true), 'p', [u('b')]);
    expect(d.projects.p.doneIds).toEqual([]);
  });
});
