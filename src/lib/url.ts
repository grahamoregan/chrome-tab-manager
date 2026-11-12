import { getDomain } from 'tldts';

/** Query parameters that only exist for tracking and never change page content. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'trk',
  'trkinfo',
  'trackingid',
  'lipi',
  'si',
  'ref_src',
  'ref_url',
  '_hsenc',
  '_hsmi',
  'yclid',
  'twclid',
  'ttclid',
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

/** Only ordinary web pages can be saved, deduplicated, grouped or captured. */
export function isWebUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/**
 * Canonical form used to decide whether two URLs are "the same link":
 * drops the fragment and tracking params, lowercases the host, removes a
 * trailing slash on non-root paths and sorts the remaining query params.
 * Non-web URLs are returned unchanged.
 */
export function normaliseUrl(raw: string): string {
  if (!isWebUrl(raw)) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  const kept = [...u.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = new URLSearchParams(kept).toString();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
  }
  return u.toString();
}

/** Registrable domain (eTLD+1), e.g. `uk.linkedin.com` → `linkedin.com`, `www.bbc.co.uk` → `bbc.co.uk`. */
export function siteOf(url: string | undefined): string | null {
  if (!isWebUrl(url)) return null;
  try {
    const host = new URL(url).hostname;
    return getDomain(host) ?? host;
  } catch {
    return null;
  }
}

/** Hostname without a leading `www.`, for display. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
