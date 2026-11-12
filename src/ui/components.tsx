import { useEffect, useState } from 'react';
import { send } from '../lib/messages';
import type { UndoEntry } from '../lib/storage';
import { displayHost } from '../lib/url';

/** Favicon via Chrome's `_favicon` API (needs the "favicon" permission). */
export function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const src = `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=${size * 2}`;
  return <img className="favicon" src={src} width={size} height={size} alt="" draggable={false} />;
}

export function Host({ url }: { url: string }) {
  return <span className="host">{displayHost(url)}</span>;
}

const UNDO_VISIBLE_MS = 30 * 60_000;

export function UndoBar({ entry }: { entry: UndoEntry | undefined }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => setDone(null), [entry?.at]);
  if (done) return <div className="undo-bar">Undone: {done}</div>;
  if (!entry || Date.now() - entry.at > UNDO_VISIBLE_MS) return null;
  return (
    <div className="undo-bar" role="status">
      <span>{entry.label}</span>
      <button
        className="btn small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const label = await send<string | null>({ type: 'undo' });
            setDone(label ?? 'nothing');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  );
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function ago(ms: number, now = Date.now()): string {
  const mins = Math.round((now - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
