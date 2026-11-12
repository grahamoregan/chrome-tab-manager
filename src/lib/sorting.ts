import { siteOf } from './url';

/** Columns a list can be sorted by. `manual` = the project's own order, or Chrome's tab order. */
export type SortBy = 'manual' | 'title' | 'site' | 'added' | 'viewed';
export type SortDir = 'asc' | 'desc';
export interface SortSpec {
  by: SortBy;
  dir: SortDir;
}

export const MANUAL: SortSpec = { by: 'manual', dir: 'asc' };

/** Dates start newest-first; text starts A→Z. */
function firstDir(by: SortBy): SortDir {
  return by === 'added' || by === 'viewed' ? 'desc' : 'asc';
}

/** Column-header click: sort by it → reverse → back to manual. */
export function nextSort(current: SortSpec, column: Exclude<SortBy, 'manual'>): SortSpec {
  if (current.by !== column) return { by: column, dir: firstDir(column) };
  if (current.dir === firstDir(column)) return { by: column, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return MANUAL;
}

/** Reads a stored sort, including the older string form ('newest', 'title', …). */
export function toSortSpec(stored: unknown): SortSpec {
  if (stored && typeof stored === 'object' && 'by' in stored) {
    const s = stored as SortSpec;
    return { by: s.by, dir: s.dir === 'desc' ? 'desc' : 'asc' };
  }
  switch (stored) {
    case 'newest':
      return { by: 'added', dir: 'desc' };
    case 'oldest':
      return { by: 'added', dir: 'asc' };
    case 'title':
      return { by: 'title', dir: 'asc' };
    case 'site':
      return { by: 'site', dir: 'asc' };
    default:
      return MANUAL;
  }
}

export interface Sortable {
  title: string;
  url: string;
  added?: number;
  viewed?: number;
}

/**
 * Sorts a copy of `items` (stable; `manual` keeps the given order). Ties fall
 * back to title, then the original order. Missing dates sort last.
 */
export function sortBy<T>(items: T[], spec: SortSpec, get: (t: T) => Sortable): T[] {
  if (spec.by === 'manual') return items;
  const sign = spec.dir === 'asc' ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  const keyed = items.map((item, i) => ({ item, i, s: get(item) }));
  keyed.sort((x, y) => {
    let c = 0;
    switch (spec.by) {
      case 'title':
        c = sign * text(x.s.title, y.s.title);
        break;
      case 'site':
        c = sign * text(siteOf(x.s.url) ?? x.s.url, siteOf(y.s.url) ?? y.s.url) || text(x.s.title, y.s.title);
        break;
      case 'added':
      case 'viewed': {
        const a = spec.by === 'added' ? x.s.added : x.s.viewed;
        const b = spec.by === 'added' ? y.s.added : y.s.viewed;
        if (a === undefined || b === undefined) c = a === b ? 0 : a === undefined ? 1 : -1;
        else c = sign * (a - b);
        break;
      }
    }
    return c || x.i - y.i;
  });
  return keyed.map((k) => k.item);
}
