import { useMemo, useState } from 'react';
import { findDuplicates, tabsToClose } from '../lib/duplicates';
import { send } from '../lib/messages';
import { sortedProjects } from '../lib/model';
import { scatteredSites, summariseSites } from '../lib/sites';
import { findStaleFeedTabs } from '../lib/staleFeeds';
import type { TabLike } from '../lib/tabs';
import { isWebUrl } from '../lib/url';
import { Favicon, Host, UndoBar, ago, plural } from '../ui/components';
import { useBusy, useData, useLiveTabs, useSettings, useUndo } from '../ui/hooks';

type View = 'home' | 'dupes' | 'stale' | 'gather' | 'save' | 'saveAll';

export function App() {
  const live = useLiveTabs();
  const settings = useSettings();
  const undo = useUndo();
  const [view, setView] = useState<View>('home');
  const { busy, error, run } = useBusy();

  const dupeGroups = useMemo(() => findDuplicates(live.tabs), [live.tabs]);
  const dupes = useMemo(() => tabsToClose(dupeGroups), [dupeGroups]);
  const stale = useMemo(
    () => findStaleFeedTabs(live.tabs, settings.feedRules, settings.staleMinutes, Date.now()),
    [live.tabs, settings.feedRules, settings.staleMinutes],
  );
  const scattered = useMemo(() => scatteredSites(live.tabs), [live.tabs]);

  const close = (tabs: TabLike[], reason: string) =>
    run(async () => {
      await send({ type: 'closeTabs', tabIds: tabs.map((t) => t.id), reason, label: `Closed ${plural(tabs.length, reason.toLowerCase())}` });
      setView('home');
    });

  const back = () => setView('home');

  return (
    <div className="popup">
      <header className="row">
        <strong className="grow">Tab Sort</strong>
        <button className="btn small" onClick={() => void send({ type: 'openManager' }).then(() => window.close())}>
          Open manager ⌥⇧T
        </button>
      </header>

      {!live.loaded ? (
        <p className="muted">Loading…</p>
      ) : view === 'home' ? (
        <Home
          live={live}
          dupes={dupes.length}
          stale={stale.length}
          scattered={scattered.length}
          onView={setView}
        />
      ) : view === 'dupes' ? (
        <Preview
          title="Close duplicates"
          note="Keeps the most recently used copy of each page. Pinned and playing tabs are never closed."
          tabs={dupes}
          confirmLabel={`Close ${plural(dupes.length, 'tab')}`}
          busy={busy}
          onBack={back}
          onConfirm={() => close(dupes, 'Duplicate')}
        />
      ) : view === 'stale' ? (
        <Preview
          title="Clear stale feeds"
          note={`Feed home pages not looked at for ${settings.staleMinutes}+ minutes. Posts and articles are never included.`}
          tabs={stale}
          confirmLabel={`Close ${plural(stale.length, 'tab')}`}
          busy={busy}
          onBack={back}
          onConfirm={() => close(stale, 'Stale feed')}
          showAge
        />
      ) : view === 'gather' ? (
        <Gather live={live} busy={busy} run={run} onBack={back} />
      ) : view === 'save' ? (
        <SaveToProject live={live} busy={busy} run={run} onBack={back} />
      ) : (
        <SaveAll live={live} busy={busy} run={run} onBack={back} />
      )}

      {error && <p className="error">{error}</p>}
      <UndoBar entry={undo} />
    </div>
  );
}

function Home({
  live,
  dupes,
  stale,
  scattered,
  onView,
}: {
  live: ReturnType<typeof useLiveTabs>;
  dupes: number;
  stale: number;
  scattered: number;
  onView: (v: View) => void;
}) {
  const windows = live.windowIds.map((id, i) => {
    const tabs = live.tabs.filter((t) => t.windowId === id);
    const top = summariseSites(tabs).slice(0, 2);
    return { id, n: i + 1, count: tabs.length, top };
  });
  return (
    <>
      <p className="stats">
        {plural(live.windowIds.length, 'window')} · {plural(live.tabs.length, 'tab')} · {plural(dupes, 'duplicate')} ·{' '}
        {plural(stale, 'stale feed')}
      </p>
      <ul className="list windows">
        {windows.map((w) => (
          <li key={w.id}>
            <button
              className={`list-item window-row ${w.id === live.currentWindowId ? 'current' : ''}`}
              onClick={() => void chrome.windows.update(w.id, { focused: true })}
            >
              <strong>Window {w.n}</strong>
              <span className="muted">{plural(w.count, 'tab')}</span>
              <span className="muted grow ellipsis">
                {w.top.length ? `mostly ${w.top.map((s) => `${s.site} (${s.count})`).join(', ')}` : ''}
              </span>
              {w.id === live.currentWindowId && <span className="badge">this</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="btn action" disabled={!dupes} onClick={() => onView('dupes')}>
          Close duplicates <span className="badge">{dupes}</span>
        </button>
        <button className="btn action" disabled={!stale} onClick={() => onView('stale')}>
          Clear stale feeds <span className="badge">{stale}</span>
        </button>
        <button className="btn action" onClick={() => onView('gather')}>
          Gather tabs by site <span className="badge">{scattered}</span>
        </button>
        <button className="btn action" onClick={() => onView('save')}>
          Save to project…
        </button>
        <button className="btn action" onClick={() => onView('saveAll')}>
          Save everything &amp; close…
        </button>
      </div>
    </>
  );
}

function TabRow({ tab, showAge }: { tab: TabLike; showAge?: boolean }) {
  return (
    <li className="list-item">
      <Favicon url={tab.url} />
      <span className="grow ellipsis" title={tab.url}>
        {tab.title || tab.url}
      </span>
      {showAge && tab.lastAccessed ? <span className="host">{ago(tab.lastAccessed)}</span> : <Host url={tab.url} />}
    </li>
  );
}

function Preview(props: {
  title: string;
  note: string;
  tabs: TabLike[];
  confirmLabel: string;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
  showAge?: boolean;
}) {
  return (
    <section>
      <h2>{props.title}</h2>
      <p className="muted">{props.note}</p>
      {props.tabs.length === 0 ? (
        <p>Nothing to close.</p>
      ) : (
        <ul className="list preview">
          {props.tabs.map((t) => (
            <TabRow key={t.id} tab={t} showAge={props.showAge} />
          ))}
        </ul>
      )}
      <div className="row footer">
        <button className="btn" onClick={props.onBack}>
          Back
        </button>
        <span className="grow" />
        <button className="btn danger" disabled={props.busy || props.tabs.length === 0} onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </section>
  );
}

type Run = ReturnType<typeof useBusy>['run'];

function Gather({ live, busy, run, onBack }: { live: ReturnType<typeof useLiveTabs>; busy: boolean; run: Run; onBack: () => void }) {
  const sites = summariseSites(live.tabs).filter((s) => s.count > 1);
  const scattered = sites.filter((s) => s.perWindow.size > 1);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <section>
      <h2>Gather tabs by site</h2>
      <p className="muted">Moves every tab from a site into the window that already has the most of them.</p>
      <ul className="list preview">
        {sites.map((s) => (
          <li key={s.site} className="list-item">
            <Favicon url={`https://${s.site}/`} />
            <span className="grow ellipsis">{s.site}</span>
            <span className="muted">
              {s.count} in {plural(s.perWindow.size, 'window')}
            </span>
            <button
              className="btn small"
              disabled={busy || s.perWindow.size < 2}
              onClick={() =>
                run(async () => {
                  const n = await send<number>({ type: 'gatherSite', site: s.site, currentWindowId: live.currentWindowId });
                  setMessage(`Moved ${plural(n, 'tab')} from ${s.site}`);
                })
              }
            >
              Gather
            </button>
          </li>
        ))}
      </ul>
      {message && <p className="muted">{message}</p>}
      <div className="row footer">
        <button className="btn" onClick={onBack}>
          Back
        </button>
        <span className="grow" />
        <button
          className="btn primary"
          disabled={busy || scattered.length === 0}
          onClick={() =>
            run(async () => {
              const n = await send<number>({ type: 'tidyAll', currentWindowId: live.currentWindowId });
              setMessage(`Moved ${plural(n, 'tab')} across ${plural(scattered.length, 'site')}`);
            })
          }
        >
          Tidy all ({scattered.length} sites)
        </button>
      </div>
    </section>
  );
}

function SaveToProject({ live, busy, run, onBack }: { live: ReturnType<typeof useLiveTabs>; busy: boolean; run: Run; onBack: () => void }) {
  const data = useData();
  const projects = sortedProjects(data, 'recent');
  const [scope, setScope] = useState<'tab' | 'window'>('tab');
  const [target, setTarget] = useState<string>('__new');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const windowTabs = live.tabs.filter((t) => t.windowId === live.currentWindowId && isWebUrl(t.url));
  const activeTab = windowTabs.find((t) => t.active);
  const tabs = scope === 'tab' ? (activeTab ? [activeTab] : []) : windowTabs;
  const effectiveTarget = target === '__new' || projects.some((p) => p.id === target) ? target : '__new';

  return (
    <section>
      <h2>Save to project</h2>
      <div className="row">
        <button className={`btn ${scope === 'tab' ? 'active' : ''}`} onClick={() => setScope('tab')}>
          This tab
        </button>
        <button className={`btn ${scope === 'window' ? 'active' : ''}`} onClick={() => setScope('window')}>
          This window ({windowTabs.length})
        </button>
      </div>
      {scope === 'tab' && activeTab && (
        <ul className="list">
          <TabRow tab={activeTab} />
        </ul>
      )}
      <label className="field">
        Project
        <select value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>
          <option value="__new">New project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.linkIds.length})
            </option>
          ))}
        </select>
      </label>
      {effectiveTarget === '__new' && (
        <input
          type="text"
          placeholder={scope === 'tab' ? activeTab?.title || 'Project name' : 'Project name'}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      )}
      {message && <p className="muted">{message}</p>}
      <div className="row footer">
        <button className="btn" onClick={onBack}>
          Back
        </button>
        <span className="grow" />
        <button
          className="btn primary"
          disabled={busy || tabs.length === 0}
          onClick={() =>
            run(async () => {
              const newName = name.trim() || (scope === 'tab' ? activeTab?.title : '') || 'Untitled project';
              await send({
                type: 'saveTabsToProject',
                tabIds: tabs.map((t) => t.id),
                target: effectiveTarget === '__new' ? { newName } : { projectId: effectiveTarget },
              });
              setMessage(`Saved ${plural(tabs.length, 'link')}`);
              setName('');
            })
          }
        >
          Save {plural(tabs.length, 'link')}
        </button>
      </div>
    </section>
  );
}

function SaveAll({ live, busy, run, onBack }: { live: ReturnType<typeof useLiveTabs>; busy: boolean; run: Run; onBack: () => void }) {
  const [perWindow, setPerWindow] = useState(false);
  const web = live.tabs.filter((t) => isWebUrl(t.url));
  const pinned = live.tabs.filter((t) => t.pinned).length;
  return (
    <section>
      <h2>Save everything &amp; close</h2>
      <p>
        Saves {plural(web.length, 'web tab')} from {plural(live.windowIds.length, 'window')} into{' '}
        {perWindow ? 'one project per window' : 'a single “Saved session” project'}, then closes every tab except the
        manager{pinned ? ` and ${plural(pinned, 'pinned tab')}` : ''}. Duplicates are merged.
      </p>
      <label className="row">
        <input type="checkbox" checked={perWindow} onChange={(e) => setPerWindow(e.target.checked)} />
        One project per window
      </label>
      <p className="muted">You can undo this: tabs are reopened and the saved project removed.</p>
      <div className="row footer">
        <button className="btn" onClick={onBack}>
          Back
        </button>
        <span className="grow" />
        <button
          className="btn danger"
          disabled={busy || live.tabs.length === 0}
          onClick={() => run(() => send({ type: 'saveEverything', perWindow }))}
        >
          Save &amp; close {plural(live.tabs.length, 'tab')}
        </button>
      </div>
    </section>
  );
}
