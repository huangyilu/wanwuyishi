import { describe, it, expect } from 'vitest';
import type { CitySummary, CountrySummary, TripBundle, TripItem } from '../../data/types';
import type { Poi } from '../world/schema';
import { tripToMarkdown } from './export-md';

const cities: CitySummary[] = [
  { id: 'city-paris', name: '巴黎', localName: 'Paris', country: 'fr', location: { lat: 1, lng: 1 }, poiCount: 0, hasSurvival: false },
  { id: 'city-rome', name: '罗马', localName: 'Roma', country: 'it', location: { lat: 1, lng: 1 }, poiCount: 0, hasSurvival: false },
];
const countries: CountrySummary[] = [];

const poiMap: Record<string, Poi> = {
  'poi-eiffel': {
    id: 'poi-eiffel', type: 'landmark', name: '埃菲尔铁塔', localName: 'Tour Eiffel', city: 'city-paris', country: 'fr',
    location: { lat: 1, lng: 1 }, tags: [], popularity: 90,
  } as unknown as Poi,
  'poi-vatican': {
    id: 'poi-vatican', type: 'museum', name: '梵蒂冈博物馆', localName: 'Musei Vaticani', city: 'city-rome', country: 'it',
    location: { lat: 1, lng: 1 }, tags: [], popularity: 80,
  } as unknown as Poi,
};

function item(p: Partial<TripItem>): TripItem {
  return {
    id: p.id ?? 'i',
    tripId: 't1',
    dayId: p.dayId ?? null,
    kind: p.kind ?? 'poi',
    poiId: p.poiId ?? null,
    customTitle: p.customTitle ?? null,
    rank: p.rank ?? 'a',
    slotStart: p.slotStart ?? null,
    slotEnd: p.slotEnd ?? null,
    status: p.status ?? 'wishlist',
    note: p.note ?? null,
    address: p.address ?? null,
    images: null,
    updatedAt: '',
    ...('transportMode' in p ? { transportMode: p.transportMode } : {}),
    ...('fromCityId' in p ? { fromCityId: p.fromCityId } : {}),
    ...('toCityId' in p ? { toCityId: p.toCityId } : {}),
  };
}

const baseBundle: TripBundle = {
  trip: {
    id: 't1', ownerId: null, title: '法意瑞秋之行', startDate: '2026-09-20', endDate: '2026-09-21',
    baseCurrency: 'EUR', preferences: {}, status: 'planning', packing: [], updatedAt: '',
  },
  members: [{ id: 'm1', tripId: 't1', userId: null, displayName: '小黄', role: 'owner' }],
  days: [
    { id: 'd1', tripId: 't1', date: '2026-09-20', cityId: 'city-paris', customCity: null, note: null },
    { id: 'd2', tripId: 't1', date: '2026-09-21', cityId: 'city-rome', customCity: null, note: null },
  ],
  items: [
    item({ id: 'i1', dayId: 'd1', kind: 'poi', poiId: 'poi-eiffel', rank: 'a', slotStart: '09:00', slotEnd: '11:00', status: 'confirmed', note: '登顶看全景' }),
    item({ id: 'i2', dayId: 'd1', kind: 'transport', transportMode: 'train', fromCityId: 'city-paris', toCityId: 'city-rome', rank: 'b', slotStart: '14:00', slotEnd: '18:00', status: 'candidate', note: '高铁' }),
    item({ id: 'i3', dayId: 'd2', kind: 'note', rank: 'a', status: 'wishlist', note: '记得买水' }),
    item({ id: 'i4', dayId: null, kind: 'poi', poiId: 'poi-vatican', rank: 'a', status: 'wishlist' }),
  ],
  votes: [], tickets: [], expenses: [],
};

describe('tripToMarkdown', () => {
  const md = tripToMarkdown(baseBundle, { poiMap, cities, countries });

  it('标题与元信息', () => {
    expect(md).toContain('# 法意瑞秋之行 · 行程单');
    expect(md).toContain('> 状态：规划中');
    expect(md).toContain('> 同行：小黄');
    expect(md).toContain('（共 2 天）');
    expect(md).toContain('⚠️ 行程信息来自规划快照');
  });

  it('每日排期：日期 / 城市 / 索引', () => {
    expect(md).toContain('### Day 1');
    expect(md).toContain('### Day 2');
    expect(md).toContain('📍 巴黎');
    expect(md).toContain('📍 罗马');
  });

  it('POI 行：名字（含原文）+ 时间 + 状态 + 备注', () => {
    expect(md).toContain('**埃菲尔铁塔（Tour Eiffel）**');
    expect(md).toContain('⏰ **09:00–11:00**');
    expect(md).toContain('✅ 已定');
    expect(md).toContain('备注：登顶看全景');
  });

  it('交通段：方式 + 起讫 + 时间 + 状态 + 备注', () => {
    expect(md).toContain('🚄 火车 巴黎 → 罗马');
    expect(md).toContain('🕓 待定');
    expect(md).toContain('备注：高铁');
  });

  it('备注条目', () => {
    expect(md).toContain('📝 记得买水');
  });

  it('候选池（未排期）单独成段', () => {
    expect(md).toContain('## 候选池（尚未排期）');
    expect(md).toContain('**梵蒂冈博物馆（Musei Vaticani）**');
  });

  it('自定义标题优先于 POI 名', () => {
    const b: TripBundle = {
      ...baseBundle,
      items: [item({ id: 'x', dayId: 'd1', kind: 'poi', customTitle: '自家楼下咖啡', status: 'confirmed' })],
    };
    const out = tripToMarkdown(b, { poiMap, cities, countries });
    expect(out).toContain('**自家楼下咖啡**');
    expect(out).not.toContain('Tour Eiffel');
  });

  it('无排期日显示占位提示', () => {
    const b: TripBundle = {
      ...baseBundle,
      days: [{ id: 'd1', tripId: 't1', date: '2026-09-20', cityId: 'city-paris', customCity: null, note: null }],
      items: [item({ id: 'x', dayId: null, kind: 'poi', poiId: 'poi-eiffel' })],
    };
    const out = tripToMarkdown(b, { poiMap, cities, countries });
    expect(out).toContain('（这天还没排点）');
    expect(out).not.toContain('Day 2');
  });

  it('没有候选池时不渲染候选段', () => {
    const b: TripBundle = {
      ...baseBundle,
      items: baseBundle.items.filter((i) => i.dayId !== null),
    };
    const out = tripToMarkdown(b, { poiMap, cities, countries });
    expect(out).not.toContain('## 候选池');
  });
});
