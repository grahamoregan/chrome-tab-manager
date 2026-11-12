import { describe, expect, it } from 'vitest';
import {
  addLinks, copyLinks, createProject, deleteProjects, emptyData, isUnsorted, mergeImport, moveLinks,
  parseImport, projectsContaining, removeLinks, searchLinks, sortedLinkIds, sortedProjects,
} from './model';

function setup() {
  let { data, projectId: a } = createProject(emptyData(), 'A', [
    { url: 'https://x.com/1', title: 'One' },
    { url: 'https://x.com/2?utm_source=z', title: 'Two' },
  ], 1, 'a');
  const r = createProject(data, 'B', [], 2, 'b');
  data = r.data;
  return { data, a, b: r.projectId };
}

describe('model', () => {
  it('stores one link per normalised url', () => {
    const { data, a } = setup();
    const next = addLinks(data, a, [{ url: 'https://x.com/1#frag' }]);
    expect(Object.keys(next.links)).toHaveLength(2);
    expect(next.projects[a].linkIds).toHaveLength(2);
    expect(next.links['https://x.com/1'].title).toBe('One');
  });
  it('copies so a link lives in two projects', () => {
    const { data, a, b } = setup();
    const next = copyLinks(data, ['https://x.com/1'], b);
    expect(projectsContaining(next, 'https://x.com/1').map((p) => p.id).sort()).toEqual([a, b]);
  });
  it('moves without duplicating and is a no-op onto itself', () => {
    const { data, a, b } = setup();
    const next = moveLinks(data, ['https://x.com/1'], a, b);
    expect(next.projects[a].linkIds).toEqual(['https://x.com/2']);
    expect(next.projects[b].linkIds).toEqual(['https://x.com/1']);
    expect(moveLinks(data, ['https://x.com/1'], a, a)).toBe(data);
  });
  it('garbage collects unreferenced links', () => {
    const { data, a } = setup();
    const next = removeLinks(data, a, ['https://x.com/1']);
    expect(next.links['https://x.com/1']).toBeUndefined();
    expect(Object.keys(deleteProjects(data, [a]).links)).toHaveLength(0);
  });
  it('does not mutate the input', () => {
    const { data, a } = setup();
    const before = JSON.stringify(data);
    removeLinks(data, a, ['https://x.com/1']);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('sorts and searches', () => {
    const { data } = setup();
    expect(sortedProjects(data, 'recent').map((p) => p.name)).toEqual(['B', 'A']);
    expect(sortedProjects(data, 'name').map((p) => p.name)).toEqual(['A', 'B']);
    expect(searchLinks(data, 'two').map((l) => l.title)).toEqual(['Two']);
  });
  it('treats a tab as unsorted until its url is in a project', () => {
    const { data, a } = setup();
    const sorted = sortedLinkIds(data);
    expect(isUnsorted('https://x.com/1#frag', sorted)).toBe(false);
    expect(isUnsorted('https://x.com/2', sorted)).toBe(false);
    expect(isUnsorted('https://x.com/3', sorted)).toBe(true);
    expect(isUnsorted('chrome://newtab/', sorted)).toBe(true);
    const after = sortedLinkIds(removeLinks(data, a, ['https://x.com/1']));
    expect(isUnsorted('https://x.com/1', after)).toBe(true);
  });
  it('round-trips export/import', () => {
    const { data } = setup();
    const parsed = parseImport(JSON.parse(JSON.stringify(data)));
    expect(mergeImport(emptyData(), parsed)).toEqual(data);
    expect(() => parseImport({ foo: 1 })).toThrow();
  });
});
