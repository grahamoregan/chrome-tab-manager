import { useCallback, useState, type MouseEvent } from 'react';

/** Finder-style selection: click, ⌘/Ctrl-click to toggle, ⇧-click for a range. */
export function useSelection(order: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  const click = useCallback(
    (key: string, e: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>) => {
      if (e.shiftKey && anchor && order.includes(anchor)) {
        const a = order.indexOf(anchor);
        const b = order.indexOf(key);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = order.slice(lo, hi + 1);
        setSelected((prev) => new Set(e.metaKey || e.ctrlKey ? [...prev, ...range] : range));
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      } else {
        setSelected(new Set([key]));
      }
      setAnchor(key);
    },
    [anchor, order],
  );

  /** For right-click / drag start: keep the selection if the item is in it, otherwise select just it. */
  const ensure = useCallback(
    (key: string): string[] => {
      if (selected.has(key)) return order.filter((k) => selected.has(k));
      setSelected(new Set([key]));
      setAnchor(key);
      return [key];
    },
    [order, selected],
  );

  const clear = useCallback(() => setSelected(new Set()), []);
  const selectAll = useCallback(() => setSelected(new Set(order)), [order]);

  return { selected, click, ensure, clear, selectAll, setSelected };
}
