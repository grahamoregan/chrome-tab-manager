import type { TabLike } from './tabs';
import { isWebUrl } from './url';

export interface FeedRule {
  id: string;
  /** Host without scheme, e.g. `linkedin.com`. Subdomains also match. */
  host: string;
  /** Path starting with `/`. Trailing slash is ignored. */
  path: string;
  /** exact: path must equal; prefix: path equals or is below (segment boundary). */
  match: 'exact' | 'prefix';
}

export const DEFAULT_FEED_RULES: FeedRule[] = [
  { id: 'linkedin-feed', host: 'linkedin.com', path: '/feed', match: 'exact' },
  { id: 'facebook-home', host: 'facebook.com', path: '/', match: 'exact' },
  { id: 'bbc-uk-news', host: 'bbc.co.uk', path: '/news', match: 'exact' },
  { id: 'bbc-com-news', host: 'bbc.com', path: '/news', match: 'exact' },
  { id: 'instagram-home', host: 'instagram.com', path: '/', match: 'exact' },
  { id: 'x-home', host: 'x.com', path: '/home', match: 'exact' },
  { id: 'twitter-home', host: 'twitter.com', path: '/home', match: 'exact' },
];

export const DEFAULT_STALE_MINUTES = 30;

function trimSlash(path: string): string {
  const p = path.trim() || '/';
  const withLead = p.startsWith('/') ? p : `/${p}`;
  return withLead.length > 1 ? withLead.replace(/\/+$/, '') || '/' : withLead;
}

function cleanHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

export function ruleMatches(url: string, rule: FeedRule): boolean {
  if (!isWebUrl(url)) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const ruleHost = cleanHost(rule.host);
  if (!ruleHost) return false;
  if (host !== ruleHost && !host.endsWith(`.${ruleHost}`)) return false;

  const path = trimSlash(u.pathname);
  const rulePath = trimSlash(rule.path);
  if (rule.match === 'exact') return path === rulePath;
  if (rulePath === '/') return true;
  return path === rulePath || path.startsWith(`${rulePath}/`);
}

export function matchingRule(url: string, rules: FeedRule[]): FeedRule | undefined {
  return rules.find((r) => ruleMatches(url, r));
}

/**
 * Tabs on a feed home page that haven't been looked at for `staleMinutes`.
 * Pinned and audible tabs, and tabs without a lastAccessed time, are skipped.
 */
export function findStaleFeedTabs(
  tabs: TabLike[],
  rules: FeedRule[],
  staleMinutes: number,
  now: number,
): TabLike[] {
  const thresholdMs = staleMinutes * 60_000;
  return tabs.filter((t) => {
    if (t.pinned || t.audible || t.active) return false;
    if (t.lastAccessed === undefined) return false;
    if (now - t.lastAccessed < thresholdMs) return false;
    return matchingRule(t.url, rules) !== undefined;
  });
}
