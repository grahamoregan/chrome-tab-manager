import { matchesQuery, queryWords } from './search';
import { MANUAL, sortBy, toSortSpec, type SortSpec } from './sorting';
import { normaliseUrl } from './url';

/** One saved link, shared by every project that contains it. `id` is the normalised URL. */
export interface Link {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  addedAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Manual order: new links are appended. */
  linkIds: string[];
  viewMode: 'list' | 'preview';
  /** Stored sort (older data may hold a plain string). Read it with toSortSpec. */
  sort?: SortSpec | LegacySort;
  /** Links marked done in this project. */
  doneIds?: string[];
  /** When each link was added to this project. */
  addedAt?: Record<string, number>;
}

type LegacySort = 'manual' | 'newest' | 'oldest' | 'title' | 'site';

export interface Data {
  version: 1;
  links: Record<string, Link>;
  projects: Record<string, Project>;
}

export interface LinkInput {
  url: string;
  title?: string;
  favIconUrl?: string;
}

export function emptyData(): Data {
  return { version: 1, links: {}, projects: {} };
}

export function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone(data: Data): Data {
  return structuredClone(data);
}

function touch(p: Project, now: number): void {
  p.updatedAt = now;
}

/** Upserts links (keeping the first-saved url/addedAt, refreshing title/favicon) and returns their ids. */
function upsertLinks(data: Data, inputs: LinkInput[], now: number): string[] {
  const ids: string[] = [];
  for (const input of inputs) {
    const id = normaliseUrl(input.url);
    const existing = data.links[id];
    if (existing) {
      if (input.title) existing.title = input.title;
      if (input.favIconUrl) existing.favIconUrl = input.favIconUrl;
    } else {
      data.links[id] = {
        id,
        url: input.url,
        title: input.title || input.url,
        favIconUrl: input.favIconUrl,
        addedAt: now,
      };
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Removes links that no project references. */
export function collectGarbage(data: Data): Data {
  const used = new Set<string>();
  for (const p of Object.values(data.projects)) for (const id of p.linkIds) used.add(id);
  for (const id of Object.keys(data.links)) if (!used.has(id)) delete data.links[id];
  return data;
}

export function createProject(
  data: Data,
  name: string,
  links: LinkInput[] = [],
  now = Date.now(),
  id = newId(),
): { data: Data; projectId: string } {
  const next = clone(data);
  const linkIds = upsertLinks(next, links, now);
  next.projects[id] = {
    id,
    name: name.trim() || 'Untitled project',
    createdAt: now,
    updatedAt: now,
    linkIds,
    viewMode: 'list',
    addedAt: Object.fromEntries(linkIds.map((l) => [l, now])),
  };
  return { data: next, projectId: id };
}

export function renameProject(data: Data, projectId: string, name: string, now = Date.now()): Data {
  const next = clone(data);
  const p = next.projects[projectId];
  if (p && name.trim()) {
    p.name = name.trim();
    touch(p, now);
  }
  return next;
}

export function setViewMode(data: Data, projectId: string, viewMode: Project['viewMode']): Data {
  const next = clone(data);
  const p = next.projects[projectId];
  if (p) p.viewMode = viewMode;
  return next;
}

export function addLinks(data: Data, projectId: string, links: LinkInput[], now = Date.now()): Data {
  const next = clone(data);
  const p = next.projects[projectId];
  if (!p) return data;
  for (const id of upsertLinks(next, links, now)) appendLink(p, id, now);
  touch(p, now);
  return next;
}

export function copyLinks(data: Data, linkIds: string[], toProjectId: string, now = Date.now()): Data {
  const next = clone(data);
  const to = next.projects[toProjectId];
  if (!to) return data;
  for (const id of linkIds) if (next.links[id]) appendLink(to, id, now);
  touch(to, now);
  return next;
}

export function removeLinks(data: Data, projectId: string, linkIds: string[], now = Date.now()): Data {
  const next = clone(data);
  const p = next.projects[projectId];
  if (!p) return data;
  const drop = new Set(linkIds);
  p.linkIds = p.linkIds.filter((id) => !drop.has(id));
  if (p.doneIds) p.doneIds = p.doneIds.filter((id) => !drop.has(id));
  if (p.addedAt) for (const id of drop) delete p.addedAt[id];
  touch(p, now);
  return collectGarbage(next);
}

function appendLink(p: Project, id: string, now: number): void {
  if (p.linkIds.includes(id)) return;
  p.linkIds.push(id);
  (p.addedAt ??= {})[id] = now;
}

/**
 * Moves `linkIds` as a block (keeping their relative order) so they sit just
 * before `beforeId`, or at the end when `beforeId` is null. Sets the project to manual order.
 */
export function reorderLinks(data: Data, projectId: string, linkIds: string[], beforeId: string | null): Data {
  const p = data.projects[projectId];
  if (!p) return data;
  const moving = new Set(linkIds);
  if (beforeId !== null && moving.has(beforeId)) return data;
  const block = p.linkIds.filter((id) => moving.has(id));
  if (block.length === 0) return data;
  const rest = p.linkIds.filter((id) => !moving.has(id));
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId);
  if (at < 0) return data;
  const next = clone(data);
  const np = next.projects[projectId];
  np.linkIds = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  np.sort = MANUAL;
  return next;
}

export function moveToTop(data: Data, projectId: string, linkIds: string[]): Data {
  const first = data.projects[projectId]?.linkIds.find((id) => !linkIds.includes(id)) ?? null;
  return first === null ? setSort(data, projectId, MANUAL) : reorderLinks(data, projectId, linkIds, first);
}

export function moveToBottom(data: Data, projectId: string, linkIds: string[]): Data {
  return reorderLinks(data, projectId, linkIds, null);
}

/**
 * Nudges the selected links one place up (-1) or down (+1) in manual order,
 * skipping over done links (which aren't shown in the main list).
 */
export function nudgeLinks(data: Data, projectId: string, linkIds: string[], dir: -1 | 1): Data {
  const p = data.projects[projectId];
  if (!p) return data;
  const done = new Set(p.doneIds ?? []);
  const visible = p.linkIds.filter((id) => !done.has(id));
  const moving = new Set(linkIds);
  const idx = visible.map((id, i) => (moving.has(id) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return data;
  if (dir === -1) {
    const above = visible[idx[0] - 1];
    return above === undefined ? setSort(data, projectId, MANUAL) : reorderLinks(data, projectId, linkIds, above);
  }
  const below = visible[idx[idx.length - 1] + 1];
  if (below === undefined) return setSort(data, projectId, MANUAL);
  const rest = p.linkIds.filter((id) => !moving.has(id));
  const afterBelow = rest[rest.indexOf(below) + 1] ?? null;
  return reorderLinks(data, projectId, linkIds, afterBelow);
}

export function setSort(data: Data, projectId: string, sort: SortSpec): Data {
  const p = data.projects[projectId];
  if (!p) return data;
  const current = toSortSpec(p.sort);
  if (current.by === sort.by && current.dir === sort.dir && typeof p.sort === 'object') return data;
  const next = clone(data);
  next.projects[projectId].sort = { ...sort };
  return next;
}

export function projectSort(p: Project): SortSpec {
  return toSortSpec(p.sort);
}

export function setDone(data: Data, projectId: string, linkIds: string[], done: boolean, now = Date.now()): Data {
  const p = data.projects[projectId];
  if (!p) return data;
  const next = clone(data);
  const np = next.projects[projectId];
  const set = new Set(np.doneIds ?? []);
  for (const id of linkIds) if (np.linkIds.includes(id)) (done ? set.add(id) : set.delete(id));
  np.doneIds = np.linkIds.filter((id) => set.has(id));
  touch(np, now);
  return next;
}

/** When a link was added to a project (falls back to when it was first saved). */
export function addedToProject(data: Data, p: Project, linkId: string): number {
  return p.addedAt?.[linkId] ?? data.links[linkId]?.addedAt ?? 0;
}

/** The project's links split into unread and read ("done"), each in the project's chosen sort. */
export function orderedLinks(data: Data, p: Project): { active: Link[]; done: Link[] } {
  const links = p.linkIds.map((id) => data.links[id]).filter((l): l is Link => !!l);
  const sorted = sortBy(links, toSortSpec(p.sort), (l) => ({ title: l.title, url: l.url, added: addedToProject(data, p, l.id) }));
  const done = new Set(p.doneIds ?? []);
  return { active: sorted.filter((l) => !done.has(l.id)), done: sorted.filter((l) => done.has(l.id)) };
}


export function moveLinks(
  data: Data,
  linkIds: string[],
  fromProjectId: string,
  toProjectId: string,
  now = Date.now(),
): Data {
  if (fromProjectId === toProjectId) return data;
  if (!data.projects[fromProjectId] || !data.projects[toProjectId]) return data;
  return removeLinks(copyLinks(data, linkIds, toProjectId, now), fromProjectId, linkIds, now);
}

export function deleteProjects(data: Data, projectIds: string[]): Data {
  const next = clone(data);
  for (const id of projectIds) delete next.projects[id];
  return collectGarbage(next);
}

/** Normalised URLs that are in at least one project. */
export function sortedLinkIds(data: Data): Set<string> {
  const ids = new Set<string>();
  for (const p of Object.values(data.projects)) for (const id of p.linkIds) ids.add(id);
  return ids;
}

/** An open tab is unsorted until its URL is saved in some project. */
export function isUnsorted(url: string, sorted: Set<string>): boolean {
  return !sorted.has(normaliseUrl(url));
}

export function projectsContaining(data: Data, linkId: string): Project[] {
  return Object.values(data.projects).filter((p) => p.linkIds.includes(linkId));
}

export type ProjectSort = 'name' | 'recent';

export function sortedProjects(data: Data, sort: ProjectSort): Project[] {
  const list = Object.values(data.projects);
  return sort === 'name'
    ? list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    : list.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Search over saved link titles and URLs across all projects (every word must match). */
export function searchLinks(data: Data, query: string): Link[] {
  const words = queryWords(query);
  return Object.values(data.links).filter((l) => matchesQuery(words, l.title, l.url));
}

/** Validates and returns imported data, or throws. */
export function parseImport(json: unknown): Data {
  const d = json as Partial<Data> | null;
  if (!d || d.version !== 1 || typeof d.links !== 'object' || typeof d.projects !== 'object' || !d.links || !d.projects) {
    throw new Error('Not a Tab Sort export file');
  }
  for (const p of Object.values(d.projects)) {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.linkIds)) throw new Error('Corrupt project in export');
  }
  return collectGarbage(clone(d as Data));
}

/** Merges imported data into existing data: projects with the same id are replaced. */
export function mergeImport(current: Data, incoming: Data): Data {
  const next = clone(current);
  for (const l of Object.values(incoming.links)) if (!next.links[l.id]) next.links[l.id] = l;
  for (const p of Object.values(incoming.projects)) next.projects[p.id] = p;
  return collectGarbage(next);
}
