/** Quick actions that used to live in the popup: duplicates, stale feeds, gather, save everything. */
import { useMemo, useState } from 'react';
import { findDuplicates } from '../lib/duplicates';
import { summariseSites } from '../lib/sites';
import { findStaleFeedTabs } from '../lib/staleFeeds';
import type { Settings } from '../lib/storage';
import type { TabLike } from '../lib/tabs';
import { isUnsorted, sortedLinkIds, type Data } from '../lib/model';
import { isManagerUrl } from '../lib/actions';
import { isWebUrl } from '../lib/url';
import { Favicon, Host, ago, plural } from '../ui/components';
import type { LiveTabs } from '../ui/hooks';
import { request } from './App';

export type ReviewKind = 'dupes' | 'stale' | 'gather' | 'saveAll';

export function useQuickCounts(live: LiveTabs, settings: Settings, now: number) {
  return useMemo(() => {
    const dupes = findDuplicates(live.tabs).reduce((n, g) => n + g.close.length, 0);
    const stale = findStaleFeedTabs(live.tabs, settings.feedRules, settings.staleMinutes, now).length;
    const scattered = summariseSites(live.tabs).filter((s) => s.perWindow.size > 1).length;
    return { dupes, stale, scattered };
  }, [live.tabs, settings.feedRules, settings.staleMinutes, now]);
}

interface ReviewProps {
  live: LiveTabs;
  data: Data;
  settings: Settings;
  now: number;
  windowLabel: (windowId: number) => string;
  onDone: () => void;
}

export function ReviewPane(props: ReviewProps & { kind: ReviewKind }) {
  switch (props.kind) {
    case 'dupes':
      return <DuplicatesReview {...props} />;
    case 'stale':
      return <StaleReview {...props} />;
    case 'gather':
      return <GatherReview {...props} />;
    case 'saveAll':
      return <SaveAllReview {...props} />;
  }
}

/** Tracks unticked tab ids, so tabs that appear later start ticked. */
function useTicks() {
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const toggle = (id: number, on: boolean) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  return { isTicked: (id: number) => !unticked.has(id), toggle, setAll: (ids: number[], on: boolean) => setUnticked(on ? new Set() : new Set(ids)) };
}

function ReviewHeader(props: {
  title: string;
  note: string;
  actionLabel: string;
  disabled: boolean;
  busy: boolean;
  danger?: boolean;
  onAction: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="review-header">
      <div className="row">
        <h2 className="grow">{props.title}</h2>
        <button className="btn" onClick={props.onCancel}>
          Cancel
        </button>
        <button className={`btn ${props.danger === false ? 'primary' : 'danger'}`} disabled={props.disabled || props.busy} onClick={props.onAction}>
          {props.busy ? 'Working…' : props.actionLabel}
        </button>
      </div>
      <p className="muted">{props.note}</p>
    </div>
  );
}

function TickRow(props: { tab: TabLike; ticked: boolean; onToggle: (on: boolean) => void; extra?: string; windowLabel: string }) {
  const { tab } = props;
  return (
    <li className={`list-item review-row ${props.ticked ? '' : 'unticked'}`}>
      <input type="checkbox" checked={props.ticked} onChange={(e) => props.onToggle(e.target.checked)} aria-label={`Close ${tab.title || tab.url}`} />
      <Favicon url={tab.url} />
      <span className="grow ellipsis" title={tab.url}>
        {tab.title || tab.url}
      </span>
      <Host url={tab.url} />
      <span className="added muted">{props.extra ?? props.windowLabel}</span>
    </li>
  );
}

function useClose(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const close = async (tabIds: number[], reason: string) => {
    if (tabIds.length === 0) return;
    setBusy(true);
    try {
      await request({ type: 'closeTabs', tabIds, reason, label: `Closed ${plural(tabIds.length, reason.toLowerCase())}` });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return { busy, close };
}

function DuplicatesReview({ live, windowLabel, onDone }: ReviewProps) {
  const groups = useMemo(() => findDuplicates(live.tabs), [live.tabs]);
  const ticks = useTicks();
  const { busy, close } = useClose(onDone);
  const all = groups.flatMap((g) => g.close);
  const chosen = all.filter((t) => ticks.isTicked(t.id));

  return (
    <div className="review">
      <ReviewHeader
        title={`Review: ${plural(all.length, 'duplicate')}`}
        note="For each page, the copy you used most recently is kept. Pinned and playing tabs are never closed. Untick any tab you want to keep."
        actionLabel={`Close ${plural(chosen.length, 'tab')}`}
        disabled={chosen.length === 0}
        busy={busy}
        onAction={() => void close(chosen.map((t) => t.id), 'Duplicate')}
        onCancel={onDone}
      />
      {groups.length === 0 ? (
        <p className="muted empty">No duplicates. Every open page is unique.</p>
      ) : (
        <>
          <SelectAll ids={all.map((t) => t.id)} ticks={ticks} />
          {groups.map((g) => (
            <section key={g.key} className="dupe-group">
              <div className="list-item kept">
                <span className="kept-label">Keep</span>
                <Favicon url={g.keep[0].url} />
                <span className="grow ellipsis" title={g.keep[0].url}>
                  {g.keep[0].title || g.keep[0].url}
                </span>
                <Host url={g.keep[0].url} />
                <span className="added muted">{windowLabel(g.keep[0].windowId)}</span>
              </div>
              <ul className="list">
                {g.close.map((t) => (
                  <TickRow key={t.id} tab={t} ticked={ticks.isTicked(t.id)} onToggle={(on) => ticks.toggle(t.id, on)} windowLabel={windowLabel(t.windowId)} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function SelectAll({ ids, ticks }: { ids: number[]; ticks: ReturnType<typeof useTicks> }) {
  const allOn = ids.every((id) => ticks.isTicked(id));
  return (
    <label className="row select-all muted">
      <input type="checkbox" checked={allOn} onChange={(e) => ticks.setAll(ids, e.target.checked)} />
      {allOn ? 'Untick all' : 'Tick all'}
    </label>
  );
}

function StaleReview({ live, settings, now, windowLabel, onDone }: ReviewProps) {
  const stale = useMemo(
    () => findStaleFeedTabs(live.tabs, settings.feedRules, settings.staleMinutes, now).sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0)),
    [live.tabs, settings.feedRules, settings.staleMinutes, now],
  );
  const ticks = useTicks();
  const { busy, close } = useClose(onDone);
  const chosen = stale.filter((t) => ticks.isTicked(t.id));

  return (
    <div className="review">
      <ReviewHeader
        title={`Review: ${plural(stale.length, 'stale feed')}`}
        note={`Feed home pages you haven't looked at for ${settings.staleMinutes}+ minutes. Posts and articles are never included. Rules are in Settings.`}
        actionLabel={`Close ${plural(chosen.length, 'tab')}`}
        disabled={chosen.length === 0}
        busy={busy}
        onAction={() => void close(chosen.map((t) => t.id), 'Stale feed')}
        onCancel={onDone}
      />
      {stale.length === 0 ? (
        <p className="muted empty">No stale feeds right now.</p>
      ) : (
        <>
          <SelectAll ids={stale.map((t) => t.id)} ticks={ticks} />
          <ul className="list">
            {stale.map((t) => (
              <TickRow
                key={t.id}
                tab={t}
                ticked={ticks.isTicked(t.id)}
                onToggle={(on) => ticks.toggle(t.id, on)}
                windowLabel={windowLabel(t.windowId)}
                extra={`${t.lastAccessed ? `seen ${ago(t.lastAccessed, now)}` : ''} · ${windowLabel(t.windowId)}`}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function GatherReview({ live, windowLabel, onDone }: ReviewProps) {
  const sites = useMemo(() => summariseSites(live.tabs).filter((s) => s.count > 1), [live.tabs]);
  const scattered = sites.filter((s) => s.perWindow.size > 1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      setMessage(await fn());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="review">
      <div className="review-header">
        <div className="row">
          <h2 className="grow">Gather tabs by site</h2>
          <button className="btn" onClick={onDone}>
            Done
          </button>
          <button
            className="btn primary"
            disabled={busy || scattered.length === 0}
            onClick={() =>
              void run(async () => {
                const n = (await request({ type: 'tidyAll', currentWindowId: live.currentWindowId })) as number;
                return `Moved ${plural(n ?? 0, 'tab')} across ${plural(scattered.length, 'site')}.`;
              })
            }
          >
            Tidy all ({plural(scattered.length, 'site')})
          </button>
        </div>
        <p className="muted">Moves every tab from a site into the window that already has the most of them. Pinned tabs stay put.</p>
        {message && <p>{message}</p>}
      </div>
      {sites.length === 0 ? (
        <p className="muted empty">No site has more than one tab open.</p>
      ) : (
        <ul className="list">
          {sites.map((s) => {
            const spread = [...s.perWindow].sort(([, a], [, b]) => b - a).map(([w, n]) => `${windowLabel(w)}: ${n}`).join(', ');
            return (
              <li key={s.site} className="list-item">
                <Favicon url={`https://${s.site}/`} />
                <span className="grow ellipsis">
                  <strong>{s.site}</strong> <span className="muted">· {plural(s.count, 'tab')}</span>
                </span>
                <span className="muted spread ellipsis">{spread}</span>
                <button
                  className="btn small"
                  disabled={busy || s.perWindow.size < 2}
                  title={s.perWindow.size < 2 ? 'Already all in one window' : undefined}
                  onClick={() =>
                    void run(async () => {
                      const n = (await request({ type: 'gatherSite', site: s.site, currentWindowId: live.currentWindowId })) as number;
                      return `Moved ${plural(n ?? 0, 'tab')} from ${s.site}.`;
                    })
                  }
                >
                  Gather
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SaveAllReview({ live, data, onDone }: ReviewProps) {
  const [perWindow, setPerWindow] = useState(false);
  const [busy, setBusy] = useState(false);
  const saved = useMemo(() => sortedLinkIds(data), [data]);
  const tabs = live.tabs.filter((t) => !isManagerUrl(t.url));
  const web = tabs.filter((t) => isWebUrl(t.url) && isUnsorted(t.url, saved));
  const alreadyInProjects = tabs.filter((t) => isWebUrl(t.url) && !isUnsorted(t.url, saved)).length;
  const pinned = live.tabs.filter((t) => t.pinned).length;
  return (
    <div className="review">
      <ReviewHeader
        title="Save everything & close"
        note="You can undo this straight afterwards: the tabs reopen and the saved project is removed."
        actionLabel={web.length ? `Save ${web.length} & close ${plural(tabs.length, 'tab')}` : `Close ${plural(tabs.length, 'tab')}`}
        disabled={live.tabs.length === 0}
        busy={busy}
        onAction={async () => {
          setBusy(true);
          try {
            await request({ type: 'saveEverything', perWindow });
            onDone();
          } finally {
            setBusy(false);
          }
        }}
        onCancel={onDone}
      />
      <p>
        {web.length > 0 ? (
          <>
            Saves {plural(web.length, 'unsorted tab')} from {plural(live.windowIds.length, 'window')} into{' '}
            {perWindow ? 'one project per window' : 'a single “Saved session” project'}, then closes every tab except this manager
            {pinned ? ` and ${plural(pinned, 'pinned tab')}` : ''}. Duplicates are merged.
          </>
        ) : (
          <>Every tab is already in a project, so nothing new needs saving. This just closes them{pinned ? ` (except ${plural(pinned, 'pinned tab')})` : ''}.</>
        )}
      </p>
      {alreadyInProjects > 0 && (
        <p className="muted">
          {plural(alreadyInProjects, 'tab')} {alreadyInProjects === 1 ? 'is' : 'are'} already in a project, so {alreadyInProjects === 1 ? 'it' : 'they'}{' '}
          won't be saved again, just closed.
        </p>
      )}
      <label className="row">
        <input type="checkbox" checked={perWindow} onChange={(e) => setPerWindow(e.target.checked)} />
        One project per window
      </label>
    </div>
  );
}
