import { describe, expect, it } from 'vitest';
import { distanceKm, sanityCheck, type CheckPoi } from './sanity-check';

const poi = (id: string, over: Partial<CheckPoi> = {}): CheckPoi => ({
  id,
  name: id,
  openness: { closedWeekdays: [], closedDates: [], seasonal: [] },
  location: { lat: 48.86, lng: 2.34 },
  durationMinutes: [120, 180],
  booking: null,
  ...over,
});

const item = (id: string, poiId: string, hasTicket = false) => ({
  id,
  poiId,
  status: 'confirmed',
  hasTicket,
});

describe('distanceKm', () => {
  it('巴黎到罗马约 1100 公里', () => {
    const d = distanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 41.9028, lng: 12.4964 });
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });
});

describe('sanityCheck', () => {
  it('一天塞 5 个大馆会报排太满', () => {
    const index: Record<string, CheckPoi> = {};
    for (let i = 1; i <= 5; i++) index[`p${i}`] = poi(`p${i}`, { durationMinutes: [150, 240] });
    const issues = sanityCheck(
      [{ date: '2026-09-20', items: [1, 2, 3, 4, 5].map((i) => item(`i${i}`, `p${i}`)) }],
      index,
    );
    const overpack = issues.filter((i) => i.kind === 'overpack');
    expect(overpack).toHaveLength(1);
    expect(overpack[0]!.message).toContain('超过一天可用');
  });

  it('宽松的一天不报警', () => {
    const index = { p1: poi('p1', { durationMinutes: [90, 120] }) };
    const issues = sanityCheck([{ date: '2026-09-20', items: [item('i1', 'p1')] }], index);
    expect(issues).toEqual([]);
  });

  it('闭馆日会被检出为 error', () => {
    const index = {
      p1: poi('p1', { openness: { closedWeekdays: [2], closedDates: [], seasonal: [] } }),
    };
    const issues = sanityCheck([{ date: '2026-09-22', items: [item('i1', 'p1')] }], index);
    expect(issues[0]!.kind).toBe('closure');
    expect(issues[0]!.level).toBe('error');
  });

  it('临近预约死线且没有票券时提醒', () => {
    const index = {
      p1: poi('p1', { booking: { required: true, leadDays: 14 } }),
    };
    const issues = sanityCheck([{ date: '2026-09-20', items: [item('i1', 'p1')] }], index, {
      today: '2026-09-12',
    });
    const booking = issues.filter((i) => i.kind === 'booking');
    expect(booking).toHaveLength(1);
    expect(booking[0]!.message).toContain('只剩 8 天');
  });

  it('已有票券则不再提醒', () => {
    const index = { p1: poi('p1', { booking: { required: true, leadDays: 14 } }) };
    const issues = sanityCheck([{ date: '2026-09-20', items: [item('i1', 'p1', true)] }], index, {
      today: '2026-09-12',
    });
    expect(issues.filter((i) => i.kind === 'booking')).toEqual([]);
  });

  it('城市内来回横跳会提示折返', () => {
    const index = {
      a: poi('a', { location: { lat: 48.86, lng: 2.29 }, durationMinutes: [30, 45] }), // 埃菲尔
      b: poi('b', { location: { lat: 48.86, lng: 2.42 }, durationMinutes: [30, 45] }), // 东郊
      c: poi('c', { location: { lat: 48.86, lng: 2.3 }, durationMinutes: [30, 45] }), // 又回西边
    };
    const issues = sanityCheck(
      [{ date: '2026-09-20', items: [item('i1', 'a'), item('i2', 'b'), item('i3', 'c')] }],
      index,
    );
    expect(issues.some((i) => i.kind === 'zigzag')).toBe(true);
  });
});
