import { describe, expect, it } from 'vitest';
import { formatDuration, formatKg, formatKm, formatPace, parseDecimal, parseDuration } from './format';

describe('format', () => {
  it('formats pace as min/km', () => {
    expect(formatPace(30 * 60, 5.2)).toBe('5:46 /km');
    expect(formatPace(28 * 60 + 45, 5)).toBe('5:45 /km');
    expect(formatPace(1800, 0)).toBeNull();
  });

  it('formats durations', () => {
    expect(formatDuration(1805)).toBe('30:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('formats kg and km without trailing zeros', () => {
    expect(formatKg(42.5)).toBe('42.5 kg');
    expect(formatKg(40)).toBe('40 kg');
    expect(formatKm(5.25)).toBe('5.25 km');
  });

  it('parses decimals with a dot or a comma', () => {
    expect(parseDecimal('5.2')).toBe(5.2);
    expect(parseDecimal('5,2')).toBe(5.2);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('-1')).toBeNull();
  });

  it('parses durations', () => {
    expect(parseDuration('30')).toBe(1800);
    expect(parseDuration('28:45')).toBe(1725);
    expect(parseDuration('1:02:05')).toBe(3725);
    expect(parseDuration('5:75')).toBeNull();
  });
});
