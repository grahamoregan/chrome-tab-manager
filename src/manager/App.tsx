import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { isManagerUrl } from '../lib/actions';
import { send } from '../lib/messages';
import {
  addLinks,
  copyLinks,
  createProject,
  deleteProjects,
  isUnsorted,
  moveLinks,
  sortedLinkIds,
  sortedProjects,
  type LinkInput,
  type Project,
} from '../lib/model';
import { saveSettings, updateData } from '../lib/storage';
import { summariseSites } from '../lib/sites';
import { isWebUrl } from '../lib/url';
import { planMerge } from '../lib/windows';
import { UndoBar, plural } from '../ui/components';
import { useData, useLiveTabs, useSettings, useUndo } from '../ui/hooks';
import { ContextMenu, type MenuState } from './ContextMenu';
import { LinkPane } from './LinkPane';
import { ReviewPane, useQuickCounts, type ReviewKind } from './Reviews';
import { SettingsPane } from './SettingsPane';

export type Pane =
  | { kind: 'project'; id: string }
  /** Open tabs; an empty windowIds means All windows. */
  | { kind: 'tabs'; windowIds: number[] }
  | { kind: 'settings' }
  | { kind: 'review'; review: ReviewKind }
  | { kind: 'none' };

export const ALL_WINDOWS: Pane = { kind: 'tabs', windowIds: [] };

export type DragPayload =
  | { source: 'project'; projectId: string; linkIds: string[] }
  | { source: 'inputs'; inputs: LinkInput[] };

export function App() {
  const data = useData();
  const settings = useSettings();
  const live = useLiveTabs();
  const undo = useUndo();

  const [pane, setPane] = useState<Pane>(ALL_WINDOWS);
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const windowAnchor = useRef<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag = useRef<DragPayload | null>(null);
  const returnPane = useRef<Pane>(ALL_WINDOWS);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘F / Ctrl+F or "/" focuses search (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      if (((e.metaKey || e.ctrlKey) && e.key === 'f') || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Stale-feed counts depend on the clock as well as on tab changes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const counts = useQuickCounts(live, settings, now);

  const projects = useMemo(() => sortedProjects(data, settings.projectSort), [data, settings.projectSort]);
  const sorted = useMemo(() => sortedLinkIds(data), [data]);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Resolve the requested pane against current data: deleted projects and closed windows fall back to All windows.
  const activePane: Pane =
    pane.kind === 'project' && !data.projects[pane.id]
      ? ALL_WINDOWS
      : pane.kind === 'tabs' && live.loaded
        ? { kind: 'tabs', windowIds: pane.windowIds.filter((id) => live.windowIds.includes(id)) }
        : pane.kind === 'none'
          ? ALL_WINDOWS
          : pane;
  const selectedWindows = activePane.kind === 'tabs' && !query ? activePane.windowIds : [];
  const showingTabs = activePane.kind === 'tabs' && !query;

  // Two or more selected windows can be merged.
  const mergeIds = selectedWindows.length >= 2 ? selectedWindows : [];
  const mergePlan = useMemo(
    () => (mergeIds.length >= 2 ? planMerge(live.tabs, mergeIds, live.currentWindowId) : null),
    [live.tabs, live.currentWindowId, mergeIds.join(',')],
  );

  /** Click selects one window (again → All windows); ⌘/Ctrl toggles; ⇧ selects a range. */
  const clickWindow = (id: number, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    setQuery('');
    const current = activePane.kind === 'tabs' ? activePane.windowIds : [];
    let next: number[];
    if (e.shiftKey && windowAnchor.current !== null && live.windowIds.includes(windowAnchor.current)) {
      const a = live.windowIds.indexOf(windowAnchor.current);
      const b = live.windowIds.indexOf(id);
      next = live.windowIds.slice(Math.min(a, b), Math.max(a, b) + 1);
    } else if (e.metaKey || e.ctrlKey) {
      next = current.includes(id) ? current.filter((w) => w !== id) : [...current, id];
      windowAnchor.current = id;
    } else {
      next = current.length === 1 && current[0] === id && activePane.kind === 'tabs' ? [] : [id];
      windowAnchor.current = id;
    }
    setPane({ kind: 'tabs', windowIds: live.windowIds.filter((w) => next.includes(w)) });
  };
  const windowNumber = (id: number) => live.windowIds.indexOf(id) + 1;
  const windowLabel = (id: number) => `Window ${windowNumber(id)}`;

  const openReview = (review: ReviewKind) => {
    if (pane.kind !== 'review') returnPane.current = pane;
    setQuery('');
    setNow(Date.now());
    setPane({ kind: 'review', review });
  };
  const closeReview = () => setPane(returnPane.current);

  const merge = async () => {
    if (!mergePlan) return;
    setMerging(true);
    try {
      const r = (await request({ type: 'mergeWindows', windowIds: mergeIds, currentWindowId: live.currentWindowId })) as {
        targetWindowId: number;
      } | null;
      if (r) {
        setQuery('');
        setPane({ kind: 'tabs', windowIds: [r.targetWindowId] });
      }
    } finally {
      setMerging(false);
    }
  };


  const createNew = async (name: string, inputs: LinkInput[] = []) => {
    let id = '';
    await updateData((d) => {
      const r = createProject(d, name, inputs);
      id = r.projectId;
      return r.data;
    });
    setPane({ kind: 'project', id });
    setQuery('');
  };

  const onDrop = async (e: DragEvent, target: Project) => {
    e.preventDefault();
    setDropTarget(null);
    const payload = drag.current;
    drag.current = null;
    if (!payload) return;
    if (payload.source === 'project') {
      if (payload.projectId === target.id) return;
      const copy = e.altKey;
      const n = payload.linkIds.length;
      await updateData(
        (d) => (copy ? copyLinks(d, payload.linkIds, target.id) : moveLinks(d, payload.linkIds, payload.projectId, target.id)),
        `${copy ? 'Copied' : 'Moved'} ${plural(n, 'link')} to ${target.name}`,
      );
    } else {
      await updateData((d) => addLinks(d, target.id, payload.inputs), `Added ${plural(payload.inputs.length, 'link')} to ${target.name}`);
    }
  };

  const deleteChecked = async () => {
    const ids = [...checked];
    await updateData((d) => deleteProjects(d, ids), `Deleted ${plural(ids.length, 'project')}`);
    setChecked(new Set());
    setConfirmDelete(false);
  };

  const checkedProjects = projects.filter((p) => checked.has(p.id));

  return (
    <div className="manager" onContextMenu={(e) => e.target === e.currentTarget && e.preventDefault()}>
      <header className="topbar">
        <strong className="brand">Tab Sort</strong>
        <input
          ref={searchRef}
          type="search"
          className="search"
          placeholder="Search"
          aria-label="Search open tabs and saved links"
          title="Search open tabs and saved links (⌘F or /)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('');
              e.currentTarget.blur();
            }
          }}
        />
        <span className="grow" />
        <UndoBar entry={undo} />
        <nav className="quick-actions" aria-label="Quick actions">
          <QuickButton label="Duplicates" count={counts.dupes} active={activePane.kind === 'review' && activePane.review === 'dupes'} onClick={() => openReview('dupes')} title="Close duplicate tabs" />
          <QuickButton label="Stale feeds" count={counts.stale} active={activePane.kind === 'review' && activePane.review === 'stale'} onClick={() => openReview('stale')} title="Close feed home pages you haven't looked at for a while" />
          <QuickButton label="Gather" count={counts.scattered} active={activePane.kind === 'review' && activePane.review === 'gather'} onClick={() => openReview('gather')} title="Pull each site's tabs into one window" />
        </nav>
        <button
          className={`btn ${activePane.kind === 'settings' ? 'active' : ''}`}
          onClick={() => {
            setQuery('');
            setPane({ kind: 'settings' });
          }}
        >
          Settings
        </button>
        <button
          className="btn"
          aria-label="More actions"
          title="More actions"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 220, y: r.bottom + 4, items: [{ label: 'Save everything & close…', onClick: () => openReview('saveAll') }] });
          }}
        >
          ⋯
        </button>
      </header>

      <aside className="sidebar">
        <section>
          <h3>
            Open tabs{' '}
            <span className="h3-stats">
              · {plural(live.windowIds.length, 'window')} · {plural(live.tabs.filter((t) => !isManagerUrl(t.url)).length, 'tab')}
            </span>
          </h3>
          <ul className="list">
            <li>
              <div
                className={`list-item side-row ${showingTabs && selectedWindows.length === 0 ? 'selected' : ''}`}
                onClick={() => {
                  setQuery('');
                  windowAnchor.current = null;
                  setPane(ALL_WINDOWS);
                }}
              >
                <span className="grow ellipsis">All windows</span>
                <span className="badge" title="Unsorted tabs in all windows">
                  {live.tabs.filter((t) => !isManagerUrl(t.url) && isUnsorted(t.url, sorted)).length}
                </span>
              </div>
            </li>
            {live.windowIds.map((id, i) => {
              const tabs = live.tabs.filter((t) => t.windowId === id && !isManagerUrl(t.url));
              const unsorted = tabs.filter((t) => isUnsorted(t.url, sorted));
              const top = summariseSites(unsorted)[0];
              const selected = selectedWindows.includes(id);
              return (
                <li key={id}>
                  <div
                    className={`list-item side-row window-row ${selected ? 'selected' : ''}`}
                    title="Click to show this window. ⌘-click to add windows (and merge them)."
                    onClick={(e) => clickWindow(id, e)}
                    onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                  >
                    <span className="grow ellipsis">
                      Window {i + 1}
                      {id === live.currentWindowId ? ' (this)' : ''}
                      {top ? <span className="muted"> · {top.site}</span> : null}
                    </span>
                    <span className="badge" title={`${unsorted.length} unsorted of ${plural(tabs.length, 'tab')}`}>
                      {unsorted.length}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="hint muted">Showing unsorted tabs: ones not in any project yet. ⌘-click windows to view several or merge them.</p>
        </section>

        <section className="projects">
          <div className="row">
            <h3 className="grow">Projects</h3>
            <select
              aria-label="Sort projects"
              value={settings.projectSort}
              onChange={(e) => void saveSettings({ projectSort: e.target.value as 'name' | 'recent' })}
            >
              <option value="recent">Recent</option>
              <option value="name">Name</option>
            </select>
            <button className="btn small" onClick={() => setNewName('')}>
              + New
            </button>
          </div>

          {newName !== null && (
            <form
              className="row new-project"
              onSubmit={(e) => {
                e.preventDefault();
                void createNew(newName);
                setNewName(null);
              }}
            >
              <input
                type="text"
                autoFocus
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNewName(null)}
              />
              <button className="btn small primary" type="submit">
                Add
              </button>
            </form>
          )}

          {checked.size > 0 && (
            <div className="delete-bar">
              {confirmDelete ? (
                <>
                  <p>
                    Delete {checkedProjects.map((p) => `“${p.name}”`).join(', ')}? Saved links only in these projects are removed.
                    Open tabs aren't closed.
                  </p>
                  <div className="row">
                    <button className="btn small" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                    <button className="btn small danger" onClick={() => void deleteChecked()}>
                      Delete {plural(checked.size, 'project')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="row">
                  <span className="grow">{plural(checked.size, 'project')} selected</span>
                  <button className="btn small" onClick={() => setChecked(new Set())}>
                    Clear
                  </button>
                  <button className="btn small danger" onClick={() => setConfirmDelete(true)}>
                    Delete…
                  </button>
                </div>
              )}
            </div>
          )}

          <ul className="list">
            {projects.length === 0 && <li className="muted empty">No projects yet. Drag tabs here from a window, or use + New.</li>}
            {projects.map((p) => {
              const selected = activePane.kind === 'project' && activePane.id === p.id && !query;
              return (
                <li key={p.id}>
                  <div
                    className={`list-item side-row ${selected ? 'selected' : ''} ${dropTarget === p.id ? 'drop' : ''}`}
                    onClick={() => {
                      setQuery('');
                      setPane({ kind: 'project', id: p.id });
                    }}
                    onDragOver={(e) => {
                      if (!drag.current) return;
                      if (drag.current.source === 'project' && drag.current.projectId === p.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = drag.current.source === 'project' && !e.altKey ? 'move' : 'copy';
                      setDropTarget(p.id);
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === p.id ? null : t))}
                    onDrop={(e) => void onDrop(e, p)}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name}`}
                      checked={checked.has(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          setConfirmDelete(false);
                          return next;
                        })
                      }
                    />
                    <span className="grow ellipsis">{p.name}</span>
                    <span className="badge" title={`${p.linkIds.length - (p.doneIds?.length ?? 0)} active · ${p.doneIds?.length ?? 0} archived`}>
                      {p.linkIds.length - (p.doneIds?.length ?? 0)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {projects.length > 0 && <p className="hint muted">Drag links onto a project to move them. Hold ⌥ to copy.</p>}
        </section>
      </aside>

      <main className="main">
        {activePane.kind === 'review' && !query ? (
          <ReviewPane key={activePane.review} kind={activePane.review} live={live} data={data} settings={settings} now={now} windowLabel={windowLabel} onDone={closeReview} />
        ) : activePane.kind === 'settings' && !query ? (
          <SettingsPane settings={settings} data={data} />
        ) : (
          <LinkPane
            key={query ? 'search' : activePane.kind === 'project' ? activePane.id : activePane.kind}
            pane={query ? { kind: 'none' } : activePane}
            query={query}
            data={data}
            live={live}
            projects={projects}
            onMenu={setMenu}
            onDragStart={(p) => (drag.current = p)}
            onDragEnd={() => {
              drag.current = null;
              setDropTarget(null);
            }}
            onNewProject={(name, inputs) => void createNew(name, inputs.filter((i) => isWebUrl(i.url)))}
            onSelectWindows={(ids) => setPane({ kind: 'tabs', windowIds: ids })}
            merge={
              mergePlan
                ? {
                    label: `Merge ${mergeIds.length} windows into ${windowLabel(mergePlan.targetWindowId)}`,
                    title: `${plural(mergePlan.moving.length, 'tab')} will move into ${windowLabel(mergePlan.targetWindowId)}, the biggest. You can undo this.`,
                    busy: merging,
                    run: () => void merge(),
                  }
                : undefined
            }
          />
        )}
      </main>

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}

function QuickButton(props: { label: string; count: number; active: boolean; title: string; onClick: () => void }) {
  return (
    <button
      className={`btn quick ${props.active ? 'active' : ''} ${props.count > 0 ? 'has-work' : ''}`}
      disabled={props.count === 0 && !props.active}
      title={props.title}
      onClick={props.onClick}
    >
      {props.label} <span className="badge">{props.count}</span>
    </button>
  );
}

/** Wraps a background request, surfacing errors via alert (manager only). */
export async function request(req: Parameters<typeof send>[0]): Promise<unknown> {
  try {
    return await send(req);
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
    return undefined;
  }
}
