import { useRef, useState } from 'react';
import { mergeImport, parseImport, type Data } from '../lib/model';
import { DEFAULT_FEED_RULES, matchingRule, type FeedRule } from '../lib/staleFeeds';
import { clearRecentlyClosed, removeFromRecentlyClosed, saveSettings, updateData, type Settings } from '../lib/storage';
import { isWebUrl } from '../lib/url';
import { Favicon, Host, ago, plural } from '../ui/components';
import { useRecentlyClosed } from '../ui/hooks';
import { request } from './App';

export function SettingsPane({ settings, data }: { settings: Settings; data: Data }) {
  return (
    <div className="settings">
      <FeedRules settings={settings} />
      <Gathering settings={settings} />
      <Backup data={data} />
      <RecentlyClosed />
    </div>
  );
}

function FeedRules({ settings }: { settings: Settings }) {
  const rules = settings.feedRules;
  const [testUrl, setTestUrl] = useState('');
  const save = (feedRules: FeedRule[]) => void saveSettings({ feedRules });
  const update = (id: string, patch: Partial<FeedRule>) => save(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const test = testUrl.trim();
  const testUrlFull = test && !/^https?:\/\//.test(test) ? `https://${test}` : test;
  const hit = isWebUrl(testUrlFull) ? matchingRule(testUrlFull, rules) : undefined;

  return (
    <section className="card-section">
      <h2>Stale feeds</h2>
      <p className="muted">
        Tabs on these home pages count as stale once you haven't looked at them for the time below. Subdomains (www., m.) match,
        and the trailing slash and query string are ignored. <strong>Exact</strong> matches only that path, so posts and articles are
        never closed. <strong>Prefix</strong> also matches everything below it.
      </p>
      <label className="row">
        Stale after
        <input
          type="number"
          min={1}
          max={1440}
          value={settings.staleMinutes}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 1) void saveSettings({ staleMinutes: n });
          }}
          style={{ width: 70 }}
        />
        minutes without being viewed
      </label>

      <table className="rules">
        <thead>
          <tr>
            <th>Host</th>
            <th>Path</th>
            <th>Match</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className={hit?.id === r.id ? 'hit' : ''}>
              <td>
                <input type="text" value={r.host} onChange={(e) => update(r.id, { host: e.target.value })} placeholder="example.com" />
              </td>
              <td>
                <input type="text" value={r.path} onChange={(e) => update(r.id, { path: e.target.value })} placeholder="/" />
              </td>
              <td>
                <select value={r.match} onChange={(e) => update(r.id, { match: e.target.value as FeedRule['match'] })}>
                  <option value="exact">Exact</option>
                  <option value="prefix">Prefix</option>
                </select>
              </td>
              <td>
                <button className="btn small ghost" aria-label={`Delete rule ${r.host}${r.path}`} onClick={() => save(rules.filter((x) => x.id !== r.id))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn" onClick={() => save([...rules, { id: `r${Date.now()}`, host: '', path: '/', match: 'exact' }])}>
          + Add rule
        </button>
        <button className="btn ghost" onClick={() => confirm('Replace your rules with the defaults?') && save(DEFAULT_FEED_RULES)}>
          Reset to defaults
        </button>
      </div>

      <label className="field">
        Test a URL
        <input type="text" placeholder="https://www.linkedin.com/feed/update/…" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />
      </label>
      {test &&
        (!isWebUrl(testUrlFull) ? (
          <p className="muted">Not a web URL.</p>
        ) : hit ? (
          <p className="warn">
            Feed: matches <code>{hit.host + hit.path}</code> ({hit.match}). Would be closed when stale.
          </p>
        ) : (
          <p className="ok">Not a feed. This link is never closed as stale.</p>
        ))}
    </section>
  );
}

function Gathering({ settings }: { settings: Settings }) {
  return (
    <section className="card-section">
      <h2>Gather by site</h2>
      <label className="row">
        <input type="checkbox" checked={settings.groupGathered} onChange={(e) => void saveSettings({ groupGathered: e.target.checked })} />
        Put gathered tabs into a tab group named after the site
      </label>
    </section>
  );
}

function Backup({ data }: { data: Data }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const projectCount = Object.keys(data.projects).length;
  const linkCount = Object.keys(data.links).length;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tab-sort-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importFile = async (file: File) => {
    try {
      const incoming = parseImport(JSON.parse(await file.text()));
      await updateData((d) => mergeImport(d, incoming), `Imported ${plural(Object.keys(incoming.projects).length, 'project')}`);
      setMessage(`Imported ${plural(Object.keys(incoming.projects).length, 'project')}. Projects with the same id were replaced.`);
    } catch (e) {
      setMessage(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <section className="card-section">
      <h2>Backup</h2>
      <p className="muted">
        {plural(projectCount, 'project')}, {plural(linkCount, 'saved link')}. Stored only in this Chrome profile. Thumbnails aren't
        included in exports.
      </p>
      <div className="row">
        <button className="btn" onClick={exportData}>
          Export JSON
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {message && <p>{message}</p>}
    </section>
  );
}

function RecentlyClosed() {
  const closed = useRecentlyClosed();
  return (
    <section className="card-section">
      <div className="row">
        <h2 className="grow">Recently closed by Tab Sort</h2>
        {closed.length > 0 && (
          <button className="btn small ghost" onClick={() => confirm('Clear the recently closed list?') && void clearRecentlyClosed()}>
            Clear list
          </button>
        )}
      </div>
      {closed.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="list recent">
          {closed.map((t) => (
            <li key={`${t.closedAt}-${t.url}`} className="list-item">
              <Favicon url={t.url} />
              <span className="grow ellipsis" title={t.url}>
                {t.title || t.url}
              </span>
              <Host url={t.url} />
              <span className="muted added">
                {t.reason} · {ago(t.closedAt)}
              </span>
              <button
                className="btn small"
                onClick={async () => {
                  await request({ type: 'reopenTabs', tabs: [t] });
                  await removeFromRecentlyClosed(t.closedAt, t.url);
                }}
              >
                Reopen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
