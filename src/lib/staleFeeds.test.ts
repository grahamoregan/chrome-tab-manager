import { describe, expect, it } from 'vitest';
import { DEFAULT_FEED_RULES, findStaleFeedTabs, matchingRule, ruleMatches } from './staleFeeds';
import type { TabLike } from './tabs';

const isFeed = (url: string) => matchingRule(url, DEFAULT_FEED_RULES) !== undefined;

describe('default feed rules', () => {
  it.each([
    'https://www.linkedin.com/feed/',
    'https://www.linkedin.com/feed',
    'https://www.linkedin.com/feed/?trk=nav',
    'https://www.facebook.com/',
    'https://m.facebook.com/?sk=h_chr',
    'https://www.bbc.co.uk/news',
    'https://www.bbc.com/news/',
    'https://www.instagram.com/',
    'https://x.com/home',
    'https://twitter.com/home',
  ])('treats %s as a feed', (url) => expect(isFeed(url)).toBe(true));

  it.each([
    'https://www.linkedin.com/feed/update/urn:li:activity:123/',
    'https://www.linkedin.com/posts/someone_activity-123',
    'https://www.linkedin.com/in/someone',
    'https://www.facebook.com/groups/abc',
    'https://www.facebook.com/permalink.php?story_fbid=1',
    'https://www.bbc.co.uk/news/articles/c123',
    'https://www.bbc.co.uk/news/uk-123456',
    'https://www.instagram.com/p/abc/',
    'https://x.com/someone/status/1',
    'https://notfacebook.com/',
  ])('keeps deep link %s', (url) => expect(isFeed(url)).toBe(false));
});

describe('prefix rules', () => {
  it('matches on segment boundaries only', () => {
    const rule = { id: 'r', host: 'example.com', path: '/feed', match: 'prefix' as const };
    expect(ruleMatches('https://example.com/feed/x', rule)).toBe(true);
    expect(ruleMatches('https://example.com/feedback', rule)).toBe(false);
  });
  it('tolerates hosts typed with scheme or www', () => {
    const rule = { id: 'r', host: 'https://www.Example.com/', path: 'news', match: 'exact' as const };
    expect(ruleMatches('https://example.com/news', rule)).toBe(true);
  });
});

describe('findStaleFeedTabs', () => {
  const now = 10_000_000;
  const tab = (id: number, url: string, minsAgo: number | undefined, extra: Partial<TabLike> = {}): TabLike => ({
    id,
    windowId: 1,
    url,
    lastAccessed: minsAgo === undefined ? undefined : now - minsAgo * 60_000,
    ...extra,
  });
  it('closes feed tabs untouched for the threshold', () => {
    const stale = findStaleFeedTabs(
      [
        tab(1, 'https://www.linkedin.com/feed/', 45),
        tab(2, 'https://www.linkedin.com/feed/', 10),
        tab(3, 'https://www.linkedin.com/posts/x', 500),
        tab(4, 'https://www.facebook.com/', 31, { pinned: true }),
        tab(5, 'https://www.facebook.com/', undefined),
        tab(6, 'https://www.bbc.co.uk/news', 30),
      ],
      DEFAULT_FEED_RULES,
      30,
      now,
    );
    expect(stale.map((t) => t.id)).toEqual([1, 6]);
  });
});
