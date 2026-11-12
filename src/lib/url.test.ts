import { describe, expect, it } from 'vitest';
import { normaliseUrl, siteOf, isWebUrl } from './url';

describe('normaliseUrl', () => {
  it('strips fragments and tracking params but keeps meaningful query', () => {
    expect(normaliseUrl('https://Example.com/a/?utm_source=x&id=3&fbclid=abc#top')).toBe('https://example.com/a?id=3');
  });
  it('treats trailing slash on non-root path as the same', () => {
    expect(normaliseUrl('https://linkedin.com/feed/')).toBe(normaliseUrl('https://linkedin.com/feed'));
  });
  it('keeps the root slash', () => {
    expect(normaliseUrl('https://facebook.com')).toBe('https://facebook.com/');
  });
  it('sorts query params so order does not matter', () => {
    expect(normaliseUrl('https://a.com/?b=2&a=1')).toBe(normaliseUrl('https://a.com/?a=1&b=2'));
  });
  it('strips linkedin trk params', () => {
    expect(normaliseUrl('https://www.linkedin.com/posts/abc?trk=public_post')).toBe('https://www.linkedin.com/posts/abc');
  });
  it('leaves non-web urls alone', () => {
    expect(normaliseUrl('chrome://extensions/')).toBe('chrome://extensions/');
    expect(isWebUrl('chrome://extensions/')).toBe(false);
  });
});

describe('siteOf', () => {
  it('returns the registrable domain', () => {
    expect(siteOf('https://uk.linkedin.com/in/someone')).toBe('linkedin.com');
    expect(siteOf('https://www.bbc.co.uk/news')).toBe('bbc.co.uk');
    expect(siteOf('http://localhost:3000/')).toBe('localhost');
    expect(siteOf('chrome://newtab')).toBeNull();
  });
});
