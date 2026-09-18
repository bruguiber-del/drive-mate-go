import { describe, it, expect } from 'vitest';
import { formatDistance } from './format';

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
