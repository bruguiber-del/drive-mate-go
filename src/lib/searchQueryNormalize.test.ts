import { describe, it, expect } from 'vitest';
import { normalizeSearchQuery, dropTrailingN, mergeDeWithTrailingN } from './searchQueryNormalize';

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

describe('dropTrailingN', () => {
  it('drops the trailing n from words ending in "-on"/"-ón"', () => {
    expect(dropTrailingN('aragon')).toBe('arago');
    expect(dropTrailingN('Aragón')).toBe('Aragó');
  });

  it('returns null for words not ending in "-on"', () => {
    expect(dropTrailingN('carrer')).toBeNull();
    expect(dropTrailingN('eivissa')).toBeNull();
  });
});

describe('mergeDeWithTrailingN', () => {
  it('merges "de <word-on>" into a single elided word', () => {
    expect(mergeDeWithTrailingN(['carrer', 'de', 'aragon', '92'])).toEqual(['carrer', 'darago', '92']);
  });

  it('returns null when there is no "de <word-on>" pair', () => {
    expect(mergeDeWithTrailingN(['carrer', 'de', 'eivissa'])).toBeNull();
    expect(mergeDeWithTrailingN(['aeropuerto', 'de', 'ibiza'])).toBeNull();
  });
});
