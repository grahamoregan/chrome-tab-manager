import { matchesQuery, queryWords } from './search';
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
  linkIds: string[];
  viewMode: 'list' | 'preview';
}

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
  next.projects[id] = { id, name: name.trim() || 'Untitled project', createdAt: now, updatedAt: now, linkIds, viewMode: 'list' };
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
  for (const id of upsertLinks(next, links, now)) if (!p.linkIds.includes(id)) p.linkIds.push(id);
  touch(p, now);
  return next;
}

export function copyLinks(data: Data, linkIds: string[], toProjectId: string, now = Date.now()): Data {
  const next = clone(data);
  const to = next.projects[toProjectId];
  if (!to) return data;
  for (const id of linkIds) if (next.links[id] && !to.linkIds.includes(id)) to.linkIds.push(id);
  touch(to, now);
  return next;
}

export function removeLinks(data: Data, projectId: string, linkIds: string[], now = Date.now()): Data {
  const next = clone(data);
  const p = next.projects[projectId];
  if (!p) return data;
  const drop = new Set(linkIds);
  p.linkIds = p.linkIds.filter((id) => !drop.has(id));
  touch(p, now);
  return collectGarbage(next);
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
