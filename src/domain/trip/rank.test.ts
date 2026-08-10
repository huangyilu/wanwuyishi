import { describe, expect, it } from 'vitest';
import { initialRank, rankBetween, rankForInsert, sequentialRanks } from './rank';

describe('rankBetween', () => {
  it('两端为空时返回居中值', () => {
    const r = rankBetween(null, null);
    expect(r > '0').toBe(true);
    expect(r < 'z').toBe(true);
  });

  it('结果严格落在区间内', () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    const mid = rankBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('反复在同一位置插入仍然有效（拖拽压力场景）', () => {
    let lo = rankBetween(null, null);
    const hi = rankBetween(lo, null);
    for (let i = 0; i < 200; i++) {
      const mid = rankBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      lo = mid;
    }
  });

  it('a >= b 时抛错，避免静默产生乱序', () => {
    expect(() => rankBetween('b', 'a')).toThrow();
    expect(() => rankBetween('a', 'a')).toThrow();
  });

  it('生成的 rank 末位不为 0，保证前面永远可插值', () => {
    let prev: string | null = null;
    for (let i = 0; i < 100; i++) {
      const r: string = rankBetween(prev, null);
      expect(r.endsWith('0')).toBe(false);
      prev = r;
    }
  });
});

describe('sequentialRanks', () => {
  it('生成严格递增序列', () => {
    const ranks = sequentialRanks(50);
    expect(ranks).toHaveLength(50);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1]! < ranks[i]!).toBe(true);
    }
  });
});

describe('rankForInsert', () => {
  const items = sequentialRanks(4).map((rank) => ({ rank }));

  it('插到最前面', () => {
    const r = rankForInsert(items, 0);
    expect(r < items[0]!.rank).toBe(true);
  });

  it('插到中间', () => {
    const r = rankForInsert(items, 2);
    expect(items[1]!.rank < r && r < items[2]!.rank).toBe(true);
  });

  it('插到最后面', () => {
    const r = rankForInsert(items, items.length);
    expect(items[items.length - 1]!.rank < r).toBe(true);
  });

  it('空列表返回初始 rank 量级的值', () => {
    expect(rankForInsert([], 0)).toBe(initialRank());
  });
});
