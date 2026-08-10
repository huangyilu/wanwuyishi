import { describe, expect, it } from 'vitest';
import { buildItinerarySheet, decideVisaCountry } from './destination-country';

const NAMES = { fr: '法国', it: '意大利', ch: '瑞士' };

const day = (date: string, countryId: string | null) => ({ date, countryId });

describe('decideVisaCountry', () => {
  it('停留最久的国家即送签国', () => {
    const r = decideVisaCountry(
      [
        day('2026-09-20', 'fr'),
        day('2026-09-21', 'fr'),
        day('2026-09-22', 'fr'),
        day('2026-09-23', 'it'),
        day('2026-09-24', 'it'),
        day('2026-09-25', 'ch'),
      ],
      NAMES,
    );
    expect(r.countryId).toBe('fr');
    expect(r.tiedByFirstEntry).toBe(false);
    expect(r.reason).toContain('法国');
    expect(r.nightsByCountry[0]).toEqual({ countryId: 'fr', nights: 3 });
  });

  it('晚数并列时回落到首个入境国', () => {
    const r = decideVisaCountry(
      [day('2026-09-20', 'it'), day('2026-09-21', 'it'), day('2026-09-22', 'fr'), day('2026-09-23', 'fr')],
      NAMES,
    );
    expect(r.countryId).toBe('it');
    expect(r.tiedByFirstEntry).toBe(true);
    expect(r.reason).toContain('首个入境国');
  });

  it('未排国家的日期不参与计数', () => {
    const r = decideVisaCountry([day('2026-09-20', null), day('2026-09-21', 'ch')], NAMES);
    expect(r.countryId).toBe('ch');
    expect(r.nightsByCountry).toHaveLength(1);
  });

  it('空行程给出明确提示而不是崩溃', () => {
    const r = decideVisaCountry([], NAMES);
    expect(r.countryId).toBeNull();
    expect(r.reason).toContain('无法判断');
  });
});

describe('buildItinerarySheet', () => {
  it('把行程编译成使馆要求的四列表格', () => {
    const rows = buildItinerarySheet({
      days: [
        { date: '2026-09-20', cityName: '巴黎', countryName: '法国' },
        { date: '2026-09-21', cityName: '巴黎', countryName: '法国' },
      ],
      transports: [{ date: '2026-09-20', text: '国航 CA933 北京—巴黎' }],
      accommodations: [
        { date: '2026-09-20', name: 'Hotel A', address: '12 Rue de Rivoli, Paris' },
        { date: '2026-09-21', name: 'Hotel A', address: '12 Rue de Rivoli, Paris' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.transport).toContain('CA933');
    expect(rows[1]!.transport).toBe('市内交通');
    expect(rows[0]!.accommodation).toBe('Hotel A');
  });

  it('缺住宿的日期用占位符而不是留空', () => {
    const rows = buildItinerarySheet({
      days: [{ date: '2026-09-20', cityName: null, countryName: null }],
      transports: [],
      accommodations: [],
    });
    expect(rows[0]).toEqual({
      date: '2026-09-20',
      city: '—',
      country: '—',
      transport: '市内交通',
      accommodation: '—',
      address: '—',
    });
  });
});
