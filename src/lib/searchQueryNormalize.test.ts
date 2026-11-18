import { describe, it, expect } from 'vitest';
import { normalizeSearchQuery } from './searchQueryNormalize';

describe('normalizeSearchQuery', () => {
  it('joins a lone "d" (from "d\'Aragó" without the apostrophe) to the next word', () => {
    expect(normalizeSearchQuery('carrer d arago 92 eivissa')).toBe('carrer darago 92 eivissa');
  });

  it('joins "l" and "s" the same way', () => {
    expect(normalizeSearchQuery('l alguer')).toBe('lalguer');
    expect(normalizeSearchQuery('s horta eivissa')).toBe('shorta eivissa');
  });

  it('is case-insensitive', () => {
    expect(normalizeSearchQuery('Carrer D Arago')).toBe('Carrer DArago');
  });

  it('does not touch normal words that happen to start with those letters', () => {
    expect(normalizeSearchQuery('carrer de aragon 92')).toBe('carrer de aragon 92');
    expect(normalizeSearchQuery('do arago eivissa')).toBe('do arago eivissa');
  });

  it('leaves a query with no elision untouched', () => {
    expect(normalizeSearchQuery('aeropuerto de ibiza')).toBe('aeropuerto de ibiza');
  });
});
