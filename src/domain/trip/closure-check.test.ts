import { describe, expect, it } from 'vitest';
import { checkClosures, isClosedOn, openDatesAmong } from './closure-check';
import { remapTripDates } from './date-remap';
import type { Openness } from '../world/schema';

const louvre: Openness = {
  closedWeekdays: [2], // 周二闭馆
  closedDates: ['2026-05-01'],
  seasonal: [],
};

const pilatus: Openness = {
  closedWeekdays: [],
  closedDates: [],
  seasonal: [{ from: '05-15', to: '11-15', note: '齿轨铁路仅夏季运行' }],
};

const winterOnly: Openness = {
  closedWeekdays: [],
  closedDates: [],
  seasonal: [{ from: '11-15', to: '03-31', note: '仅冬季开放' }],
};

describe('isClosedOn', () => {
  it('识别每周固定闭馆日', () => {
    // 2026-09-22 是周二
    expect(isClosedOn(louvre, '2026-09-22').closed).toBe(true);
    expect(isClosedOn(louvre, '2026-09-23').closed).toBe(false);
  });

  it('识别指定闭馆日期', () => {
    const r = isClosedOn(louvre, '2026-05-01');
    expect(r.closed).toBe(true);
    expect(r.reason).toBe('date');
  });

  it('季节性区间之外视为不开放', () => {
    expect(isClosedOn(pilatus, '2026-09-20').closed).toBe(false);
    expect(isClosedOn(pilatus, '2026-12-20').closed).toBe(true);
  });

  it('跨年的季节区间也能正确判断', () => {
    expect(isClosedOn(winterOnly, '2026-01-10').closed).toBe(false);
    expect(isClosedOn(winterOnly, '2026-12-20').closed).toBe(false);
    expect(isClosedOn(winterOnly, '2026-07-01').closed).toBe(true);
  });
});

describe('checkClosures', () => {
  const poi = { id: 'poi-louvre', name: '卢浮宫', openness: louvre };
  const tripDates = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'];

  it('给出撞车提示与同程内的改期建议', () => {
    const conflicts = checkClosures([{ date: '2026-09-22', poi }], tripDates);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.message).toContain('卢浮宫');
    expect(conflicts[0]!.message).toContain('周二');
    expect(conflicts[0]!.suggestions).toEqual(['2026-09-21', '2026-09-23', '2026-09-24']);
  });

  it('没有冲突时返回空数组', () => {
    expect(checkClosures([{ date: '2026-09-23', poi }], tripDates)).toEqual([]);
  });
});

describe('remapTripDates', () => {
  const poiIndex = {
    'poi-louvre': { id: 'poi-louvre', name: '卢浮宫', openness: louvre },
  };
  const days = [
    { id: 'd1', date: '2026-09-20', poiIds: ['poi-louvre'] },
    { id: 'd2', date: '2026-09-21', poiIds: [] },
    { id: 'd3', date: '2026-09-22', poiIds: [] },
  ];

  it('整体平移并保持天数间隔', () => {
    const r = remapTripDates(days, '2026-10-04', poiIndex);
    expect(r.offsetDays).toBe(14);
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06']);
  });

  it('平移后撞上闭馆日会被检出，且能区分原本就存在的冲突', () => {
    // 平移 2 天后，卢浮宫落到 2026-09-22（周二）
    const r = remapTripDates(days, '2026-09-22', poiIndex);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]!.poiId).toBe('poi-louvre');
    expect(r.preexistingConflicts).toHaveLength(0);
  });
});

describe('openDatesAmong', () => {
  it('筛掉全部闭馆日', () => {
    const dates = ['2026-09-21', '2026-09-22', '2026-09-23'];
    expect(openDatesAmong(louvre, dates)).toEqual(['2026-09-21', '2026-09-23']);
  });
});
