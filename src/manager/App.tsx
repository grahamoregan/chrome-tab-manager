import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { send } from '../lib/messages';
import {
  addLinks,
  copyLinks,
  createProject,
  deleteProjects,
  moveLinks,
  sortedProjects,
  type LinkInput,
  type Project,
} from '../lib/model';
import { saveSettings, updateData } from '../lib/storage';
import { summariseSites } from '../lib/sites';
import { isWebUrl } from '../lib/url';
import { UndoBar, plural } from '../ui/components';
import { useData, useLiveTabs, useSettings, useUndo } from '../ui/hooks';
import { ContextMenu, type MenuState } from './ContextMenu';
import { LinkPane } from './LinkPane';
import { SettingsPane } from './SettingsPane';

export type Pane =
  | { kind: 'project'; id: string }
  | { kind: 'window'; id: number }
  | { kind: 'settings' }
  | { kind: 'none' };

export type DragPayload =
  | { source: 'project'; projectId: string; linkIds: string[] }
  | { source: 'inputs'; inputs: LinkInput[] };

export function App() {
  const data = useData();
  const settings = useSettings();
  const live = useLiveTabs();
  const undo = useUndo();

  const [pane, setPane] = useState<Pane>({ kind: 'none' });
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag = useRef<DragPayload | null>(null);

  const projects = useMemo(() => sortedProjects(data, settings.projectSort), [data, settings.projectSort]);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Fall back to the first project if the selected one disappears.
  const activePane: Pane =
    pane.kind === 'project' && !data.projects[pane.id]
      ? projects[0]
        ? { kind: 'project', id: projects[0].id }
        : { kind: 'none' }
      : pane.kind === 'window' && live.loaded && !live.windowIds.includes(pane.id)
        ? { kind: 'none' }
        : pane.kind === 'none' && projects[0]
          ? { kind: 'project', id: projects[0].id }
          : pane;

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
          type="search"
          className="search"
          placeholder="Search all projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="grow" />
        <UndoBar entry={undo} />
        <button
          className={`btn ${activePane.kind === 'settings' ? 'active' : ''}`}
          onClick={() => {
            setQuery('');
            setPane({ kind: 'settings' });
          }}
        >
          Settings
        </button>
      </header>

      <aside className="sidebar">
        <section>
          <h3>Open tabs</h3>
          <ul className="list">
            {live.windowIds.map((id, i) => {
              const tabs = live.tabs.filter((t) => t.windowId === id);
              const top = summariseSites(tabs)[0];
              const selected = activePane.kind === 'window' && activePane.id === id && !query;
              return (
                <li key={id}>
                  <div
                    className={`list-item side-row ${selected ? 'selected' : ''}`}
                    onClick={() => {
                      setQuery('');
                      setPane({ kind: 'window', id });
                    }}
                  >
                    <span className="grow ellipsis">
                      Window {i + 1}
                      {id === live.currentWindowId ? ' (this)' : ''}
                      {top ? <span className="muted"> · {top.site}</span> : null}
                    </span>
                    <span className="badge">{tabs.length}</span>
                  </div>
                </li>
              );
            })}
          </ul>
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
                    <span className="badge">{p.linkIds.length}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {projects.length > 0 && <p className="hint muted">Drag links onto a project to move them. Hold ⌥ to copy.</p>}
        </section>
      </aside>

      <main className="main">
        {activePane.kind === 'settings' && !query ? (
          <SettingsPane settings={settings} data={data} />
        ) : (
          <LinkPane
            key={query ? 'search' : activePane.kind === 'project' ? activePane.id : activePane.kind === 'window' ? `w${activePane.id}` : 'none'}
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
          />
        )}
      </main>

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
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
