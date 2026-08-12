import { formatDuration } from './duration';
import { describe, expect, it } from 'vitest';

describe('formatDuration', () => {
  it('不足 1 小时用分钟、区间不折叠成 0-0', () => {
    expect(formatDuration([15, 15])).toBe('15 分钟');
    expect(formatDuration([30, 45])).toBe('30-45 分钟');
  });

  it('整小时显示为整数小时、上下界相同不显示区间', () => {
    expect(formatDuration([60, 60])).toBe('1 小时');
    expect(formatDuration([120, 180])).toBe('2-3 小时');
  });

  it('非整小时保留一位小数', () => {
    expect(formatDuration([90, 90])).toBe('1.5 小时');
    expect(formatDuration([90, 120])).toBe('1.5-2 小时');
  });

  it('跨小时区间用分钟-小时混排', () => {
    expect(formatDuration([30, 90])).toBe('30 分钟 - 1.5 小时');
  });
});
