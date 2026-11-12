import { describe, expect, it } from 'vitest';
import { MANUAL, nextSort, sortBy, toSortSpec, type Sortable } from './sorting';

const items: Sortable[] = [
  { title: 'banana', url: 'https://www.zeta.com/1', added: 2, viewed: 20 },
  { title: 'Apple', url: 'https://alpha.co.uk/x', added: 3 },
  { title: 'cherry', url: 'https://m.alpha.co.uk/y', added: 1, viewed: 30 },
  { title: 'item 10', url: 'https://b.com', added: 4, viewed: 10 },
  { title: 'item 9', url: 'https://b.com', added: 5, viewed: 5 },
];
const titles = (spec: Parameters<typeof sortBy>[1]) => sortBy(items, spec, (s) => s).map((s) => s.title).join(', ');

describe('sortBy', () => {
  it('keeps manual order', () => expect(titles(MANUAL)).toBe('banana, Apple, cherry, item 10, item 9'));
  it('sorts text case-insensitively and numerically, both ways', () => {
    expect(titles({ by: 'title', dir: 'asc' })).toBe('Apple, banana, cherry, item 9, item 10');
    expect(titles({ by: 'title', dir: 'desc' })).toBe('item 10, item 9, cherry, banana, Apple');
  });
  it('sorts by registrable domain, then title', () => {
    expect(titles({ by: 'site', dir: 'asc' })).toBe('Apple, cherry, item 9, item 10, banana');
  });
  it('sorts dates, with missing dates last in both directions', () => {
    expect(titles({ by: 'added', dir: 'desc' })).toBe('item 9, item 10, Apple, banana, cherry');
    expect(titles({ by: 'viewed', dir: 'desc' })).toBe('cherry, banana, item 10, item 9, Apple');
    expect(titles({ by: 'viewed', dir: 'asc' })).toBe('item 9, item 10, banana, cherry, Apple');
  });
});

describe('nextSort', () => {
  it('cycles a column: first direction → reversed → manual', () => {
    let s = nextSort(MANUAL, 'title');
    expect(s).toEqual({ by: 'title', dir: 'asc' });
    s = nextSort(s, 'title');
    expect(s).toEqual({ by: 'title', dir: 'desc' });
    expect(nextSort(s, 'title')).toEqual(MANUAL);
  });
  it('starts dates newest first, and switching column starts fresh', () => {
    expect(nextSort(MANUAL, 'added')).toEqual({ by: 'added', dir: 'desc' });
    expect(nextSort({ by: 'title', dir: 'desc' }, 'site')).toEqual({ by: 'site', dir: 'asc' });
  });
});

describe('toSortSpec', () => {
  it('reads old stored strings and new objects', () => {
    expect(toSortSpec('newest')).toEqual({ by: 'added', dir: 'desc' });
    expect(toSortSpec('oldest')).toEqual({ by: 'added', dir: 'asc' });
    expect(toSortSpec('site')).toEqual({ by: 'site', dir: 'asc' });
    expect(toSortSpec(undefined)).toEqual(MANUAL);
    expect(toSortSpec({ by: 'title', dir: 'desc' })).toEqual({ by: 'title', dir: 'desc' });
  });
});
