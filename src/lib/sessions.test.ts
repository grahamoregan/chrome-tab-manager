import { describe, expect, it } from 'vitest';
import { createProject, emptyData, findSessionDuplicates, isSessionProject, markSession, removeSessionDuplicates, renameProject, setDone, type Data } from './model';

const u = (n: string) => `https://${n}.com/`;
function setup(): Data {
  let d = createProject(emptyData(), 'Research', [{ url: u('a') }, { url: u('b') }], 100, 'mine').data;
  d = markSession(createProject(d, 'Saved session – 1 Nov, 09:00', [{ url: u('a') }, { url: u('c') }, { url: u('d') }], 200, 'old').data, 'old');
  // Older version: session recognised by name only (no flag).
  d = createProject(d, 'Saved session – 5 Nov, 18:00', [{ url: u('b') }, { url: u('c') }], 300, 'legacy').data;
  d = markSession(createProject(d, 'Saved session – 9 Nov, 17:30', [{ url: u('c') }, { url: u('e') }], 400, 'new').data, 'new');
  return d;
}
const summary = (d: Data) => findSessionDuplicates(d).map((x) => `${x.linkId.slice(8, 9)}:${x.fromProjectId}→${x.keptInProjectId}`).sort();

describe('session projects', () => {
  it('are recognised by flag or by the old name, and keep the flag when renamed', () => {
    const d = setup();
    expect(isSessionProject(d.projects.old)).toBe(true);
    expect(isSessionProject(d.projects.legacy)).toBe(true);
    expect(isSessionProject(d.projects.mine)).toBe(false);
    expect(isSessionProject(renameProject(d, 'new', 'Thursday stuff').projects.new)).toBe(true);
  });

  it('finds duplicates: your projects win, otherwise the newest session keeps it', () => {
    expect(summary(setup())).toEqual(['a:old→mine', 'b:legacy→mine', 'c:legacy→new', 'c:old→new']);
  });

  it('treats archived links in your projects as yours too', () => {
    const d = setDone(setup(), 'mine', [u('a')], true);
    expect(summary(d)).toContain('a:old→mine');
  });

  it('removes them, deletes emptied sessions, and never touches your projects', () => {
    const d = setup();
    const after = removeSessionDuplicates(d, findSessionDuplicates(d));
    expect(after.projects.mine.linkIds).toEqual(d.projects.mine.linkIds);
    expect(after.projects.old.linkIds).toEqual([u('d')]);
    expect(after.projects.legacy).toBeUndefined();
    expect(after.projects.new.linkIds).toEqual([u('c'), u('e')]);
    expect(findSessionDuplicates(after)).toEqual([]);
    expect(Object.keys(after.links).sort()).toEqual([u('a'), u('b'), u('c'), u('d'), u('e')].sort());
  });

  it('can remove just a chosen subset', () => {
    const d = setup();
    const only = findSessionDuplicates(d).filter((x) => x.fromProjectId === 'old');
    const after = removeSessionDuplicates(d, only);
    expect(after.projects.legacy.linkIds).toEqual(d.projects.legacy.linkIds);
    expect(after.projects.old.linkIds).toEqual([u('d')]);
  });
});
