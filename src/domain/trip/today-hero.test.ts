import { computeTodayHero } from './today-hero';
import type { CitySummary, CountrySummary, PackingItem, TripBundle, TripDay, TripItem } from '../../data/types';
import type { Poi } from '../world/schema';
import { describe, expect, it } from 'vitest';

const city = (id: string, country: string): CitySummary => ({
  id,
  name: id,
  localName: id,
  country,
  location: { lat: 0, lng: 0 },
  poiCount: 0,
  hasSurvival: false,
});

const country = (id: string, name: string, hasVisa: boolean): CountrySummary => ({
  id,
  name,
  localName: name,
  currency: 'EUR',
  hasVisa,
});

const day = (id: string, date: string, cityId: string | null = 'c-fr'): TripDay => ({
  id,
  tripId: 't',
  date,
  cityId,
  customCity: null,
  note: null,
});

const poi = (id: string, required: boolean): Poi =>
  ({ id, booking: { required, leadDays: 30 } }) as unknown as Poi;

const item = (id: string, poiId: string | null, kind: 'poi' | 'transport' | 'note' = 'poi'): TripItem => ({
  id,
  tripId: 't',
  dayId: 'd1',
  kind,
  poiId,
  customTitle: null,
  rank: 'a',
  slotStart: null,
  slotEnd: null,
  status: 'confirmed',
  note: null,
  address: null,
  updatedAt: '',
});

const packing = (n: number, done: boolean, category = '衣物'): PackingItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `pk${i}`,
    category,
    text: `x${i}`,
    done,
    ownerId: null,
    assigneeId: null,
    note: null,
  }));

function bundle(over: Partial<TripBundle> = {}): TripBundle {
  return {
    trip: { id: 't', ownerId: null, title: '法意瑞', startDate: null, endDate: null, baseCurrency: 'EUR', preferences: {}, status: 'planning', packing: [], updatedAt: '' },
    members: [],
    days: [],
    items: [],
    votes: [],
    tickets: [],
    expenses: [],
    ...over,
  };
}

const cities = [city('c-fr', 'fr'), city('c-it', 'it')];
const countries = [country('fr', '法国', true), country('it', '意大利', true), country('cn', '中国', false)];

describe('computeTodayHero', () => {
  it('今天命中某天 → matched，无文案', () => {
    const h = computeTodayHero({
      today: '2026-09-20',
      bundle: bundle({ days: [day('d1', '2026-09-20')] }),
      cities,
      countries,
    });
    expect(h.matched).toBe(true);
    expect(h.headline).toBe('');
    expect(h.reminders).toEqual([]);
  });

  it('行程在未来 → 倒计时为正数', () => {
    const h = computeTodayHero({
      today: '2026-09-01',
      bundle: bundle({ days: [day('d1', '2026-09-20'), day('d2', '2026-09-21')] }),
      cities,
      countries,
    });
    expect(h.matched).toBe(false);
    expect(h.headline).toBe('还有 19 天');
    expect(h.sub).toContain('9月20日');
  });

  it('行程已过去 → 倒计时为负数', () => {
    const h = computeTodayHero({
      today: '2026-10-10',
      bundle: bundle({ days: [day('d1', '2026-09-20')] }),
      cities,
      countries,
    });
    expect(h.headline).toBe('已过去 20 天');
  });

  it('无排期 → 提示去排期', () => {
    const h = computeTodayHero({ today: '2026-09-01', bundle: bundle(), cities, countries });
    expect(h.headline).toBe('还没排期');
  });

  it('待订票提醒（需预订且未订）', () => {
    const b = bundle({
      days: [day('d1', '2026-09-20')],
      items: [item('i1', 'p1'), item('i2', 'p2')],
      tickets: [{ id: 'tk', tripId: 't', itemId: 'i1', title: '', channel: null, officialUrl: null, priceCents: null, currency: null, timeSlot: null, bookingRef: null, booked: true, leadDays: null, note: null }],
    });
    const h = computeTodayHero({
      today: '2026-09-01',
      bundle: b,
      poiMap: { p1: poi('p1', true), p2: poi('p2', true) },
      cities,
      countries,
    });
    expect(h.reminders.some((r) => r.text.includes('1 个景点待订票') && r.warn)).toBe(true);
  });

  it('打包未完成提醒，证件类单独标注', () => {
    const b = bundle({
      days: [day('d1', '2026-09-20')],
      trip: {
        id: 't',
        ownerId: null,
        title: '法意瑞',
        startDate: null,
        endDate: null,
        baseCurrency: 'EUR',
        preferences: {},
        status: 'planning',
        packing: [...packing(2, false, '衣物'), ...packing(1, false, '证件')],
        updatedAt: '',
      },
    });
    const h = computeTodayHero({ today: '2026-09-01', bundle: b, cities, countries });
    expect(h.reminders.some((r) => r.text.includes('打包清单还剩 3 件未勾') && r.text.includes('证件类'))).toBe(true);
  });

  it('多国行程 → 需办签证提醒', () => {
    const b = bundle({
      days: [day('d1', '2026-09-20', 'c-fr'), day('d2', '2026-09-22', 'c-it')],
    });
    const h = computeTodayHero({ today: '2026-09-01', bundle: b, cities, countries });
    expect(h.reminders.some((r) => r.text.includes('需办理 法国、意大利 签证') && r.warn)).toBe(true);
  });

  it('目的地非 CNY → 货币提醒', () => {
    const b = bundle({ days: [day('d1', '2026-09-20')], trip: { id: 't', ownerId: null, title: 'x', startDate: null, endDate: null, baseCurrency: 'EUR', preferences: {}, status: 'planning', packing: [], updatedAt: '' } });
    const h = computeTodayHero({ today: '2026-09-01', bundle: b, cities, countries });
    expect(h.reminders.some((r) => r.text.includes('目的地货币 EUR'))).toBe(true);
  });
});
