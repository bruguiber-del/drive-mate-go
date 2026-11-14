import { describe, it, expect } from 'vitest';
import { formatDistance, formatDuration } from './format';

describe('formatDistance', () => {
  it('formats sub-kilometer distances rounded to the nearest metre', () => {
    expect(formatDistance(167)).toBe('167m');
    expect(formatDistance(167.6)).toBe('168m');
    expect(formatDistance(0)).toBe('0m');
  });

  it('switches to kilometres with one decimal at 1000m and above', () => {
    expect(formatDistance(999)).toBe('999m');
    expect(formatDistance(1000)).toBe('1.0km');
    expect(formatDistance(1500)).toBe('1.5km');
    expect(formatDistance(12345)).toBe('12.3km');
  });
});

describe('formatDuration', () => {
  it('stays in minutes below 1h', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(59)).toBe('59 min');
  });

  it('switches to hours+minutes at 60 and above', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(122)).toBe('2h 2min');
    expect(formatDuration(125)).toBe('2h 5min');
  });

  it('rounds to the nearest minute', () => {
    expect(formatDuration(59.6)).toBe('1h');
    expect(formatDuration(121.6)).toBe('2h 2min');
  });
});
