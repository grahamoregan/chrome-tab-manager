import { describe, expect, it } from 'vitest';
import { matchesQuery, queryWords } from './search';

describe('search', () => {
  const m = (q: string, title: string, url: string) => matchesQuery(queryWords(q), title, url);
  it('matches every word in any order across title and url', () => {
    expect(m('linkedin rust', 'Rust jobs', 'https://www.linkedin.com/jobs')).toBe(true);
    expect(m('RUST  linkedin', 'Rust jobs', 'https://www.linkedin.com/jobs')).toBe(true);
    expect(m('linkedin python', 'Rust jobs', 'https://www.linkedin.com/jobs')).toBe(false);
  });
  it('matches nothing for an empty query', () => {
    expect(m('   ', 'anything', 'https://a.com')).toBe(false);
  });
});
