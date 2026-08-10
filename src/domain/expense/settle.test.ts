import { describe, expect, it } from 'vitest';
import { computeBalances, formatMoney, minimalTransfers, settle, splitAmount } from './settle';

const equal = (...ids: string[]) => ids.map((memberId) => ({ memberId, weight: 1 }));

describe('splitAmount', () => {
  it('除不尽时用最大余数法，总和守恒', () => {
    const r = splitAmount(100, equal('a', 'b', 'c'));
    expect(Object.values(r).reduce((s, x) => s + x, 0)).toBe(100);
    expect(Object.values(r).sort()).toEqual([33, 33, 34]);
  });

  it('支持权重（例如一人带小孩算 1.5 份）', () => {
    const r = splitAmount(1000, [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 1.5 },
    ]);
    expect(r.a! + r.b!).toBe(1000);
    expect(r.b!).toBeGreaterThan(r.a!);
  });

  it('大量小额分摊不产生累计漂移', () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) {
      const r = splitAmount(1, equal('a', 'b', 'c'));
      total += Object.values(r).reduce((s, x) => s + x, 0);
    }
    expect(total).toBe(1000);
  });
});

describe('computeBalances', () => {
  it('付款人记正、参与人记负', () => {
    const b = computeBalances([
      { id: 'e1', amountCents: 9000, payerMemberId: 'm1', splitMode: 'aa', shares: equal('m1', 'm2', 'm3') },
    ]);
    expect(b.m1).toBe(6000);
    expect(b.m2).toBe(-3000);
    expect(b.m3).toBe(-3000);
    expect(Object.values(b).reduce((s, x) => s + x, 0)).toBe(0);
  });

  it('幽灵成员同样参与结算', () => {
    const b = computeBalances([
      { id: 'e1', amountCents: 6000, payerMemberId: 'm1', splitMode: 'aa', shares: equal('m1', 'ghost-1') },
    ]);
    expect(b['ghost-1']).toBe(-3000);
  });

  it('个人自付不进入共同分摊，结算完全跳过', () => {
    const b = computeBalances([
      { id: 'e1', amountCents: 9000, payerMemberId: 'm1', splitMode: 'personal', shares: [] },
      { id: 'e2', amountCents: 6000, payerMemberId: 'm1', splitMode: 'aa', shares: equal('m1', 'm2') },
    ]);
    // 个人 9000 整笔忽略：m1 仅因 e2 记 +6000 后扣减 3000 = 3000，m2 记 -3000
    expect(b.m1).toBe(3000);
    expect(b.m2).toBe(-3000);
    expect(Object.values(b).reduce((s, x) => s + x, 0)).toBe(0);
  });
});

describe('minimalTransfers', () => {
  it('三人一笔账只需一次转账链', () => {
    const transfers = minimalTransfers({ m1: 6000, m2: -3000, m3: -3000 });
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.toMemberId === 'm1')).toBe(true);
    expect(transfers.reduce((s, t) => s + t.amountCents, 0)).toBe(6000);
  });

  it('互相抵消后不产生多余转账', () => {
    const transfers = minimalTransfers({ a: 0, b: 0 });
    expect(transfers).toEqual([]);
  });

  it('转账笔数不超过 n-1', () => {
    const balances = { a: 10000, b: -2500, c: -2500, d: -2500, e: -2500 };
    expect(minimalTransfers(balances).length).toBeLessThanOrEqual(4);
  });
});

describe('settle 端到端', () => {
  it('多笔混合支出后账目归零', () => {
    const r = settle([
      { id: 'e1', amountCents: 12000, payerMemberId: 'm1', splitMode: 'aa', shares: equal('m1', 'm2') },
      { id: 'e2', amountCents: 8000, payerMemberId: 'm2', splitMode: 'aa', shares: equal('m1', 'm2') },
      { id: 'e3', amountCents: 3300, payerMemberId: 'm2', splitMode: 'aa', shares: equal('m1', 'm2', 'ghost') },
    ]);
    expect(r.totalCents).toBe(23300);
    expect(Object.values(r.balances).reduce((s, x) => s + x, 0)).toBe(0);

    // 按结算方案执行后所有人应归零
    const after = { ...r.balances };
    for (const t of r.transfers) {
      after[t.fromMemberId] = (after[t.fromMemberId] ?? 0) + t.amountCents;
      after[t.toMemberId] = (after[t.toMemberId] ?? 0) - t.amountCents;
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
});

describe('formatMoney', () => {
  it('按币种输出并保留两位小数', () => {
    expect(formatMoney(123450)).toBe('¥1,234.50');
    expect(formatMoney(3200, 'EUR')).toBe('€32.00');
    expect(formatMoney(-500)).toBe('-¥5.00');
  });
});
