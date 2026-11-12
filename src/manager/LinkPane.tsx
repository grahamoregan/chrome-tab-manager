import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import {
  addLinks,
  addedToProject,
  copyLinks,
  moveToBottom,
  moveToTop,
  nudgeLinks,
  orderedLinks,
  reorderLinks,
  setDone,
  projectSort,
  setSort,
  moveLinks,
  isUnsorted,
  removeLinks,
  renameProject,
  searchLinks,
  setViewMode,
  sortedLinkIds,
  type Data,
  type LinkInput,
  type Project,
} from '../lib/model';
import { isManagerUrl } from '../lib/actions';
import { matchesQuery, queryWords } from '../lib/search';
import { MANUAL, nextSort, sortBy, type SortBy, type SortSpec } from '../lib/sorting';
import { updateData } from '../lib/storage';
import { isWebUrl, normaliseUrl } from '../lib/url';
import { Favicon, Host, ago, plural } from '../ui/components';
import { useThumbnail, type LiveTabs } from '../ui/hooks';
import { request, type DragPayload, type Pane } from './App';
import type { MenuItem, MenuState } from './ContextMenu';
import { useSelection } from './selection';

interface Item {
  key: string;
  linkId: string;
  url: string;
  title: string;
  addedAt?: number;
  tabId?: number;
  windowId?: number;
  /** Archived in the current project ("done" in the data). */
  done?: boolean;
  /** When an open tab was last looked at. */
  viewedAt?: number;
}

type Column = Exclude<SortBy, 'manual'>;
const COLUMN_LABELS: Record<Column, string> = { title: 'Title', site: 'Site', added: 'Added', viewed: 'Last viewed' };

/** Choices for the preview-mode dropdown (no column headers there). */
function sortChoices(dateColumn: 'added' | 'viewed', manualLabel: string): { value: string; label: string; spec: SortSpec }[] {
  const date = COLUMN_LABELS[dateColumn];
  return [
    { value: 'manual', label: manualLabel, spec: MANUAL },
    { value: `${dateColumn}:desc`, label: `${date}: newest first`, spec: { by: dateColumn, dir: 'desc' } },
    { value: `${dateColumn}:asc`, label: `${date}: oldest first`, spec: { by: dateColumn, dir: 'asc' } },
    { value: 'title:asc', label: 'Title A→Z', spec: { by: 'title', dir: 'asc' } },
    { value: 'title:desc', label: 'Title Z→A', spec: { by: 'title', dir: 'desc' } },
    { value: 'site:asc', label: 'Site A→Z', spec: { by: 'site', dir: 'asc' } },
    { value: 'site:desc', label: 'Site Z→A', spec: { by: 'site', dir: 'desc' } },
  ];
}
const specValue = (s: SortSpec) => (s.by === 'manual' ? 'manual' : `${s.by}:${s.dir}`);

const OPEN_CONFIRM_THRESHOLD = 20;

export function LinkPane(props: {
  pane: Pane;
  query: string;
  data: Data;
  live: LiveTabs;
  projects: Project[];
  onMenu: (m: MenuState) => void;
  onDragStart: (p: DragPayload) => void;
  onDragEnd: () => void;
  onNewProject: (name: string, inputs: LinkInput[]) => void;
  onSelectWindows: (windowIds: number[]) => void;
  /** Present when two or more windows are selected. */
  merge?: { label: string; title: string; busy: boolean; run: () => void };
}) {
  const { pane, query, data, live, projects } = props;
  const project = pane.kind === 'project' ? data.projects[pane.id] : undefined;
  // Tabs view: the windows being shown (all of them when none are selected).
  const isTabs = pane.kind === 'tabs';
  const shownWindows = pane.kind === 'tabs' ? (pane.windowIds.length ? pane.windowIds : live.windowIds) : [];
  const singleWindow = pane.kind === 'tabs' && pane.windowIds.length === 1 ? pane.windowIds[0] : undefined;
  const windowIndex = singleWindow !== undefined ? live.windowIds.indexOf(singleWindow) : -1;
  const isSearch = query.trim() !== '';
  const [localMode, setLocalMode] = useState<Project['viewMode']>('list');
  const [showSorted, setShowSorted] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [tabSort, setTabSort] = useState<SortSpec>(MANUAL);
  const sortSpec: SortSpec = project ? projectSort(project) : tabSort;
  const changeSort = (spec: SortSpec) => (project ? void updateData((d) => setSort(d, project.id, spec)) : setTabSort(spec));
  const ordered = useMemo(() => (project ? orderedLinks(data, project) : null), [data, project]);
  const reorderable = !!project && !isSearch && projectSort(project).by === 'manual';
  const reorderKeys = useRef<string[] | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; edge: 'before' | 'after' } | null>(null);
  const viewMode = project ? project.viewMode : localMode;
  const sorted = useMemo(() => sortedLinkIds(data), [data]);
  const windowTabCount = isTabs ? live.tabs.filter((t) => shownWindows.includes(t.windowId) && !isManagerUrl(t.url)).length : 0;

  const tabItem = (t: LiveTabs['tabs'][number]): Item => ({
    key: `t${t.id}`,
    linkId: normaliseUrl(t.url),
    url: t.url,
    title: t.title || t.url,
    tabId: t.id,
    windowId: t.windowId,
    viewedAt: t.lastAccessed,
  });

  const items: Item[] = useMemo(() => {
    if (isSearch) {
      // Open tabs first (all windows, sorted or not), then saved links.
      const words = queryWords(query);
      const tabs = live.tabs
        .filter((t) => !isManagerUrl(t.url) && matchesQuery(words, t.title, t.url))
        .sort((a, b) => live.windowIds.indexOf(a.windowId) - live.windowIds.indexOf(b.windowId) || (a.index ?? 0) - (b.index ?? 0))
        .map(tabItem);
      // A saved link that's open is already listed (with its project chips) under Open tabs.
      const shown = new Set(tabs.map((t) => t.linkId));
      const links = searchLinks(data, query)
        .filter((l) => !shown.has(l.id))
        .map((l) => ({ key: l.id, linkId: l.id, url: l.url, title: l.title, addedAt: l.addedAt }));
      return [...tabs, ...links];
    }
    if (project && ordered) {
      const toItem = (l: (typeof ordered.active)[number], done: boolean): Item => ({
        key: l.id,
        linkId: l.id,
        url: l.url,
        title: l.title,
        addedAt: addedToProject(data, project, l.id),
        done,
      });
      return [...ordered.active.map((l) => toItem(l, false)), ...(showDone ? ordered.done.map((l) => toItem(l, true)) : [])];
    }
    if (isTabs) {
      const tabs = live.tabs
        .filter((t) => shownWindows.includes(t.windowId) && !isManagerUrl(t.url) && (showSorted || isUnsorted(t.url, sorted)))
        .sort((a, b) => live.windowIds.indexOf(a.windowId) - live.windowIds.indexOf(b.windowId) || (a.index ?? 0) - (b.index ?? 0))
        .map(tabItem);
      // Sorting is stable, so window grouping (applied when rendering) keeps each group sorted.
      return sortBy(tabs, tabSort, (i) => ({ title: i.title, url: i.url, viewed: i.viewedAt }));
    }
    return [];
  }, [isSearch, query, data, project, ordered, showDone, isTabs, shownWindows.join(','), live.tabs, live.windowIds, showSorted, sorted, tabSort]);
  const tabResults = isSearch ? items.filter((i) => i.tabId !== undefined) : [];
  const linkResults = isSearch ? items.filter((i) => i.tabId === undefined) : [];
  const windowLabel = (id?: number) => (id === undefined ? '' : `Window ${live.windowIds.indexOf(id) + 1}`);

  const order = useMemo(() => items.map((i) => i.key), [items]);
  const sel = useSelection(order);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const openKeys = useMemo(() => new Set(live.tabs.map((t) => normaliseUrl(t.url))), [live.tabs]);
  const chips = useMemo(() => {
    const m = new Map<string, Project[]>();
    for (const p of Object.values(data.projects)) for (const id of p.linkIds) m.set(id, [...(m.get(id) ?? []), p]);
    return m;
  }, [data.projects]);

  const selectedItems = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((i): i is Item => !!i);
  const inputsOf = (list: Item[]): LinkInput[] => list.filter((i) => isWebUrl(i.url)).map((i) => ({ url: i.url, title: i.title }));
  const linkIdsOf = (list: Item[]) => list.map((i) => i.linkId);

  const openItems = async (list: Item[]) => {
    for (const i of list) await request({ type: 'focusOrOpen', url: i.url });
  };

  const archiveItems = (list: Item[]) => {
    if (!project || list.length === 0) return;
    void updateData(
      (d) => setDone(d, project.id, linkIdsOf(list), true),
      list.length === 1 ? `Archived “${list[0].title}”` : `Archived ${plural(list.length, 'link')}`,
    );
  };

  const removeFromProject = (list: Item[]) => {
    if (!project || list.length === 0) return;
    void updateData((d) => removeLinks(d, project.id, linkIdsOf(list)), `Removed ${plural(list.length, 'link')} from ${project.name}`);
    sel.clear();
  };

  // Keyboard: ⌘A select all, Esc clear, Delete/Backspace removes from project.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        sel.selectAll();
      } else if (e.key === 'Escape') {
        sel.clear();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && project && !isSearch && sel.selected.size) {
        // Same as ×: archive active links, remove archived ones.
        const chosen = selectedItems(order.filter((k) => sel.selected.has(k)));
        const active = chosen.filter((i) => !i.done);
        const archived = chosen.filter((i) => i.done);
        if (active.length) archiveItems(active);
        if (archived.length) removeFromProject(archived);
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && project && !isSearch && sel.selected.size) {
        e.preventDefault();
        const ids = selectedItems(order.filter((k) => sel.selected.has(k))).filter((i) => !i.done).map((i) => i.linkId);
        if (ids.length) void updateData((d) => nudgeLinks(d, project.id, ids, e.key === 'ArrowUp' ? -1 : 1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const closeItems = (list: Item[]) => {
    const tabIds = list.map((i) => i.tabId).filter((id): id is number => id !== undefined);
    if (tabIds.length === 0) return;
    void request({ type: 'closeTabs', tabIds, reason: 'Closed from manager', label: `Closed ${plural(tabIds.length, 'tab')}` });
  };

  const projectSubmenu = (exclude: string | undefined, fn: (p: Project) => void): MenuItem[] =>
    projects.filter((p) => p.id !== exclude).map((p) => ({ label: p.name, onClick: () => fn(p) }));

  const onContextMenu = (e: MouseEvent, key: string) => {
    e.preventDefault();
    // A selection can mix open tabs and saved links (in search); act on the same kind as the clicked row.
    const isTab = byKey.get(key)?.tabId !== undefined;
    const list = selectedItems(sel.ensure(key)).filter((i) => (i.tabId !== undefined) === isTab);
    const n = list.length;
    const allOpen = list.every((i) => openKeys.has(i.linkId));
    const openLabel = n === 1 ? (allOpen ? 'Focus tab' : 'Open') : allOpen ? `Focus ${n} tabs` : `Open ${n} links`;
    const items: (MenuItem | 'separator')[] = [];

    if (isTab) {
      items.push(
        { label: n === 1 ? 'Focus tab' : `Focus ${n} tabs`, onClick: () => void openItems(list) },
        { label: 'Add to project', submenu: projectSubmenu(undefined, (p) => void updateData((d) => addLinks(d, p.id, inputsOf(list)), `Added ${plural(n, 'link')} to ${p.name}`)) },
        { label: 'New project from selection…', onClick: () => props.onNewProject(list[0].title, inputsOf(list)) },
        'separator',
        { label: n === 1 ? 'Close tab' : `Close ${n} tabs`, danger: true, onClick: () => closeItems(list) },
      );
    } else {
      items.push(
        { label: openLabel, onClick: () => void openItems(list) },
        { label: 'Open in new window', onClick: () => void request({ type: 'openUrlsInNewWindow', urls: list.map((i) => i.url) }) },
        'separator',
        {
          label: 'Copy to project',
          submenu: projectSubmenu(project?.id, (p) => void updateData((d) => copyLinks(d, linkIdsOf(list), p.id), `Copied ${plural(n, 'link')} to ${p.name}`)),
        },
      );
      if (project && !isSearch) {
        const allDone = list.every((i) => i.done);
        const notDone = list.filter((i) => !i.done).map((i) => i.linkId);
        items.splice(
          2,
          0,
          'separator',
          {
            label: allDone ? 'Unarchive' : 'Archive',
            onClick: () =>
              void updateData(
                (d) => setDone(d, project.id, linkIdsOf(list), !allDone),
                `${allDone ? 'Unarchived' : 'Archived'} ${plural(n, 'link')}`,
              ),
          },
          { label: 'Move to top', disabled: notDone.length === 0, onClick: () => void updateData((d) => moveToTop(d, project.id, notDone), `Moved ${plural(notDone.length, 'link')} to the top`) },
          { label: 'Move to bottom', disabled: notDone.length === 0, onClick: () => void updateData((d) => moveToBottom(d, project.id, notDone), `Moved ${plural(notDone.length, 'link')} to the bottom`) },
        );
      }
      if (project) {
        items.push(
          {
            label: 'Move to project',
            submenu: projectSubmenu(project.id, (p) => void updateData((d) => moveLinks(d, linkIdsOf(list), project.id, p.id), `Moved ${plural(n, 'link')} to ${p.name}`)),
          },
          'separator',
          { label: 'Remove from this project', danger: true, onClick: () => removeFromProject(list) },
        );
      }
    }
    props.onMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onDragStart = (e: DragEvent, key: string) => {
    const list = selectedItems(sel.ensure(key));
    reorderKeys.current = reorderable && list.every((i) => !i.done) ? list.map((i) => i.linkId) : null;
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/uri-list', list.map((i) => i.url).join('\n'));
    e.dataTransfer.setData('text/plain', list.map((i) => i.url).join('\n'));
    if (list.length > 1) {
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = plural(list.length, 'link');
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 10, 10);
      setTimeout(() => ghost.remove(), 0);
    }
    props.onDragStart(
      project && !isSearch
        ? { source: 'project', projectId: project.id, linkIds: linkIdsOf(list) }
        : { source: 'inputs', inputs: inputsOf(list) },
    );
  };

  return (
    <div className="link-pane" onClick={(e) => e.target === e.currentTarget && sel.clear()}>
      <Header
        pane={pane}
        isSearch={isSearch}
        query={query}
        project={project}
        tabsTitle={
          singleWindow !== undefined
            ? `Window ${windowIndex + 1}`
            : pane.kind === 'tabs' && pane.windowIds.length > 1
              ? `Windows ${pane.windowIds.map((id) => live.windowIds.indexOf(id) + 1).join(', ')}`
              : 'All windows'
        }
        singleWindow={singleWindow}
        merge={props.merge}
        count={items.length}
        searchCounts={{ tabs: tabResults.length, links: linkResults.length }}
        windowTabCount={windowTabCount}
        showSorted={showSorted}
        onShowSorted={setShowSorted}
        viewMode={viewMode}
        onViewMode={(m) => (project ? void updateData((d) => setViewMode(d, project.id, m)) : setLocalMode(m))}
        onNewFromWindow={() => props.onNewProject(`Window ${windowIndex + 1} – ${new Date().toLocaleDateString()}`, inputsOf(items))}
        openableCount={items.filter((i) => !i.done && !openKeys.has(i.linkId)).length}
        sortSpec={sortSpec}
        onSort={changeSort}
        showSortMenu={!isSearch && viewMode === 'preview' && (!!project || isTabs)}
        doneCount={ordered?.done.length ?? 0}
        toGo={ordered?.active.length ?? 0}
      />

      {items.length === 0 ? (
        <p className="muted empty">
          {isSearch
            ? 'No open tabs or saved links match.'
            : project
              ? 'This project is empty. Drag tabs in from a window on the left, or right-click a page and choose “Add to Tab Sort project”.'
              : isTabs
                ? windowTabCount > 0
                  ? `All ${plural(windowTabCount, 'tab')} ${singleWindow !== undefined ? 'in this window' : 'here'} are in a project. Nothing left to sort.`
                  : 'No tabs here.'
                : 'Create a project, or pick a window on the left to see its tabs.'}
        </p>
      ) : isSearch ? (
        <>
          {tabResults.length > 0 && (
            <section className="results">
              <h3 className="results-heading">Open tabs</h3>
              {renderList(tabResults)}
            </section>
          )}
          {linkResults.length > 0 && (
            <section className="results">
              <h3 className="results-heading">Saved links</h3>
              {renderList(linkResults)}
            </section>
          )}
        </>
      ) : isTabs && shownWindows.length > 1 ? (
        // Several windows: group tabs under a heading per window.
        <>
        {columnHeader()}
        {shownWindows
          .map((wid) => ({ wid, list: items.filter((i) => i.windowId === wid) }))
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <section key={g.wid} className="results">
              <button className="results-heading window-heading" title="Show only this window" onClick={() => props.onSelectWindows([g.wid])}>
                {windowLabel(g.wid)}
                {g.wid === live.currentWindowId ? ' (this)' : ''} · {g.list.length}
                {showSorted ? '' : ' unsorted'}
              </button>
              {renderList(g.list)}
            </section>
          ))}
        </>
      ) : project && ordered ? (
        <>
          {ordered.active.length > 0 && columnHeader()}
          {renderList(items.filter((i) => !i.done))}
          {ordered.active.length === 0 && <p className="muted empty">All caught up: everything in this project is archived.</p>}
          {ordered.done.length > 0 && (
            <section className="done-section">
              <button className="results-heading window-heading" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                {showDone ? '▾' : '▸'} Archived ({ordered.done.length})
              </button>
              {showDone && renderList(items.filter((i) => i.done))}
            </section>
          )}
        </>
      ) : (
        <>
          {isTabs && columnHeader()}
          {renderList(items)}
        </>
      )}
    </div>
  );

  /** List-mode column titles; clicking a sortable one cycles its sort. */
  function columnHeader() {
    if (viewMode !== 'list' || isSearch) return null;
    const dateColumn: Column = project ? 'added' : 'viewed';
    const cell = (col: Column, className: string) => {
      const active = sortSpec.by === col;
      const arrow = active ? (sortSpec.dir === 'asc' ? '▲' : '▼') : '';
      return (
        <button
          className={`col ${className} ${active ? 'active' : ''}`}
          aria-sort={active ? (sortSpec.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          title={`Sort by ${COLUMN_LABELS[col].toLowerCase()}${active ? ' (click again to ' + (nextSort(sortSpec, col).by === 'manual' ? 'remove the sort)' : 'reverse)') : ''}`}
          onClick={() => changeSort(nextSort(sortSpec, col))}
        >
          {COLUMN_LABELS[col]} <span className="arrow">{arrow}</span>
        </button>
      );
    };
    return (
      <div className="col-head" role="row">
        <span className="col-dot" />
        <span className="col-fav" />
        <span className="col-title-wrap">
          {cell('title', 'col-title')}
          {sortSpec.by !== 'manual' && (
            <button className="col col-reset" title={`Go back to ${project ? 'your manual' : "Chrome's tab"} order`} onClick={() => changeSort(MANUAL)}>
              Remove sort
            </button>
          )}
        </span>
        {cell('site', 'col-site')}
        {cell(dateColumn, 'col-date')}
        <span className="col-close" />
      </div>
    );
  }

  /** Where in manual order a drop on `item` lands: before it, or before the next link that isn't being dragged. */
  function dropBeforeId(item: Item, edge: 'before' | 'after', moving: string[]): string | null {
    if (edge === 'before') return item.linkId;
    const rest = project!.linkIds.filter((id) => !moving.includes(id));
    return rest[rest.indexOf(item.linkId) + 1] ?? null;
  }

  function rowDragOver(e: DragEvent, item: Item) {
    const moving = reorderKeys.current;
    if (!moving || item.done || moving.includes(item.linkId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = viewMode === 'preview' ? (e.clientX < r.left + r.width / 2 ? 'before' : 'after') : e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    if (dropAt?.key !== item.key || dropAt.edge !== edge) setDropAt({ key: item.key, edge });
  }

  function rowDrop(e: DragEvent, item: Item) {
    const moving = reorderKeys.current;
    if (!moving || !project || item.done || moving.includes(item.linkId)) return;
    e.preventDefault();
    e.stopPropagation();
    const edge = dropAt?.key === item.key ? dropAt.edge : 'before';
    const before = dropBeforeId(item, edge, moving);
    setDropAt(null);
    reorderKeys.current = null;
    void updateData((d) => reorderLinks(d, project.id, moving, before), `Reordered ${plural(moving.length, 'link')}`);
  }

  function renderList(list: Item[]) {
    return (
        <ul className={viewMode === 'preview' ? 'cards' : 'list rows'} onClick={(e) => e.target === e.currentTarget && sel.clear()}>
          {list.map((item) => (
            <Row
              key={item.key}
              item={item}
              mode={viewMode}
              selected={sel.selected.has(item.key)}
              open={openKeys.has(item.linkId)}
              chips={chips.get(item.linkId) ?? []}
              listChips={item.tabId !== undefined && (isSearch || showSorted)}
              where={
                item.tabId === undefined
                  ? undefined
                  : isSearch
                    ? windowLabel(item.windowId)
                    : item.viewedAt
                      ? ago(item.viewedAt)
                      : ''
              }
              onClick={(e) => sel.click(item.key, e)}
              onDoubleClick={() => void openItems([item])}
              onContextMenu={(e) => onContextMenu(e, item.key)}
              onDragStart={(e) => onDragStart(e, item.key)}
              onDragEnd={() => {
                reorderKeys.current = null;
                setDropAt(null);
                props.onDragEnd();
              }}
              onClose={
                item.tabId !== undefined
                  ? () => closeItems([item])
                  : project && !isSearch
                    ? () => (item.done ? removeFromProject([item]) : archiveItems([item]))
                    : undefined
              }
              closeLabel={item.tabId !== undefined ? 'Close tab' : item.done ? 'Remove from project' : 'Archive'}
              dropEdge={dropAt?.key === item.key ? dropAt.edge : null}
              onRowDragOver={reorderable ? (e) => rowDragOver(e, item) : undefined}
              onRowDrop={reorderable ? (e) => rowDrop(e, item) : undefined}
            />
          ))}
        </ul>
    );
  }
}

function Header(props: {
  pane: Pane;
  isSearch: boolean;
  query: string;
  project?: Project;
  tabsTitle: string;
  singleWindow?: number;
  merge?: { label: string; title: string; busy: boolean; run: () => void };
  count: number;
  searchCounts: { tabs: number; links: number };
  windowTabCount: number;
  showSorted: boolean;
  onShowSorted: (v: boolean) => void;
  viewMode: Project['viewMode'];
  onViewMode: (m: Project['viewMode']) => void;
  onNewFromWindow: () => void;
  openableCount: number;
  sortSpec: SortSpec;
  onSort: (s: SortSpec) => void;
  showSortMenu: boolean;
  doneCount: number;
  toGo: number;
}) {
  const { project } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project?.name ?? '');

  let title: React.ReactNode;
  if (props.isSearch) title = <h2>Search: “{props.query.trim()}”</h2>;
  else if (project)
    title = editing ? (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void updateData((d) => renameProject(d, project.id, name));
          setEditing(false);
        }}
      >
        <input
          type="text"
          className="title-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
      </form>
    ) : (
      <h2
        className="editable"
        title="Click to rename"
        onClick={() => {
          setName(project.name);
          setEditing(true);
        }}
      >
        {project.name}
      </h2>
    );
  else if (props.pane.kind === 'tabs') title = <h2>{props.tabsTitle}</h2>;
  else title = <h2>Tab Sort</h2>;

  return (
    <div className="pane-header row">
      <div className="grow row">
        {title}
        <span className="muted">
          {props.isSearch
            ? `${plural(props.searchCounts.tabs, 'open tab')} · ${plural(props.searchCounts.links, 'saved link')}`
            : props.pane.kind === 'tabs'
            ? props.showSorted
              ? plural(props.windowTabCount, 'tab')
              : `${props.count} unsorted of ${plural(props.windowTabCount, 'tab')}`
            : props.project && props.doneCount
              ? `${props.toGo} active · ${props.doneCount} archived`
              : plural(props.count, 'link')}
        </span>
      </div>
      {props.pane.kind === 'tabs' && !props.isSearch && (
        <>
          <label className="row toggle">
            <input type="checkbox" checked={props.showSorted} onChange={(e) => props.onShowSorted(e.target.checked)} />
            Show sorted tabs
          </label>
          {props.singleWindow !== undefined && (
            <>
              <button className="btn" onClick={() => void chrome.windows.update(props.singleWindow!, { focused: true })}>
                Focus window
              </button>
              <button className="btn" disabled={props.count === 0} onClick={props.onNewFromWindow}>
                New project from this window
              </button>
            </>
          )}
          {props.merge && (
            <button className="btn primary" disabled={props.merge.busy} title={props.merge.title} onClick={props.merge.run}>
              {props.merge.busy ? 'Merging…' : props.merge.label}
            </button>
          )}
        </>
      )}
      {props.showSortMenu && (
        <select
          aria-label="Sort"
          title="Sort"
          value={specValue(props.sortSpec)}
          onChange={(e) => {
            const choice = sortChoices(project ? 'added' : 'viewed', project ? 'Manual order' : 'Tab order').find((c) => c.value === e.target.value);
            if (choice) props.onSort(choice.spec);
          }}
        >
          {sortChoices(project ? 'added' : 'viewed', project ? 'Manual order' : 'Tab order').map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {project && !props.isSearch && (
        <button
          className="btn primary"
          disabled={props.openableCount === 0}
          title={props.openableCount === 0 ? 'Everything in this project is already open' : undefined}
          onClick={() => {
            if (props.openableCount > OPEN_CONFIRM_THRESHOLD && !confirm(`Open ${props.openableCount} links in a new window? Tabs load when you click them.`)) return;
            void request({ type: 'openProject', projectId: project.id });
          }}
        >
          Open project{props.openableCount ? ` (${props.openableCount})` : ''}
        </button>
      )}
      <div className="segmented" role="group" aria-label="View mode">
        <button className={`btn ${props.viewMode === 'list' ? 'active' : ''}`} onClick={() => props.onViewMode('list')}>
          List
        </button>
        <button className={`btn ${props.viewMode === 'preview' ? 'active' : ''}`} onClick={() => props.onViewMode('preview')}>
          Preview
        </button>
      </div>
    </div>
  );
}

function Row(props: {
  item: Item;
  mode: Project['viewMode'];
  selected: boolean;
  open: boolean;
  chips: Project[];
  listChips?: boolean;
  /** Shown in place of the date added, e.g. which window a tab is in. */
  where?: string;
  onClick: (e: MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  /** Shows a × on the right: closes a tab, archives an active project link, or removes an archived one. */
  onClose?: () => void;
  closeLabel?: string;
  /** Drop indicator while reordering. */
  dropEdge: 'before' | 'after' | null;
  onRowDragOver?: (e: DragEvent) => void;
  onRowDrop?: (e: DragEvent) => void;
}) {
  const { item, mode } = props;
  const dropClass = props.dropEdge ? `drop-${props.dropEdge}` : '';
  const doneClass = item.done ? 'is-done-row' : '';
  const closeButton = props.onClose && (
    <button
      className={`close-tab ${item.done ? 'remove' : ''}`}
      aria-label={`${props.closeLabel ?? 'Close tab'}: ${item.title}`}
      title={props.closeLabel ?? 'Close tab'}
      draggable={false}
      onClick={(e) => {
        e.stopPropagation();
        props.onClose?.();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      ×
    </button>
  );
  const thumb = useThumbnail(item.linkId, mode === 'preview');
  const common = {
    draggable: true,
    onClick: props.onClick,
    onDoubleClick: props.onDoubleClick,
    onContextMenu: props.onContextMenu,
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
    onDragOver: props.onRowDragOver,
    onDrop: props.onRowDrop,
    title: item.url,
  };

  if (mode === 'preview') {
    return (
      <li className={`card ${props.selected ? 'selected' : ''} ${dropClass} ${doneClass}`} {...common}>
        <div className="thumb">
          {thumb ? <img src={thumb} alt="" draggable={false} /> : <Favicon url={item.url} size={32} />}
          {props.open && <span className={`dot open-dot ${closeButton ? 'left' : ''}`} title="Open in a tab" />}
          {closeButton}
        </div>
        <div className="card-body">
          <div className="row">
            <Favicon url={item.url} />
            <span className="grow ellipsis card-title">{item.title}</span>
          </div>
          <Host url={item.url} />
          {props.chips.length > 0 && (
            <div className="chips">
              {props.chips.map((p) => (
                <span key={p.id} className="chip">
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className={`list-item link-row ${props.selected ? 'selected' : ''} ${dropClass} ${doneClass}`} {...common}>
      <span className={`dot ${props.open ? '' : 'off'}`} title={props.open ? 'Open in a tab' : undefined} />
      <Favicon url={item.url} />
      <span className="grow ellipsis">{item.title}</span>
      {props.listChips && props.chips.length > 0 && (
        <span className="chips list-chips">
          {props.chips.map((p) => (
            <span key={p.id} className="chip">
              {p.name}
            </span>
          ))}
        </span>
      )}
      <Host url={item.url} />
      {props.where !== undefined ? (
        <span className="added muted">{props.where}</span>
      ) : (
        item.addedAt !== undefined && <span className="added muted">{ago(item.addedAt)}</span>
      )}
      {closeButton}
    </li>
  );
}
