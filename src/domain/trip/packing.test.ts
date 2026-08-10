import { describe, it, expect } from 'vitest';
import { suggestPacking } from './packing';

const base = {
  days: 5,
  countries: ['fr', 'ch'],
  currencies: ['EUR', 'CHF'],
  poiTypes: ['museum'],
  tags: ['art'],
  ownerIds: ['m1', 'm2'],
};

describe('suggestPacking', () => {
  it('始终包含证件 / 电子 / 衣物 / 洗漱 / 药品 基础项', () => {
    const out = suggestPacking(base).map((o) => o.text);
    expect(out).toContain('护照 / 身份证');
    expect(out).toContain('手机 + 充电器');
    expect(out.some((t) => t.startsWith('内衣 ×'))).toBe(true);
    expect(out).toContain('防晒霜');
    expect(out).toContain('常用药 + 肠胃药');
  });

  it('按目的地货币生成现金项', () => {
    expect(suggestPacking(base).map((o) => o.text)).toContain('当地现金（EUR/CHF）+ 信用卡');
  });

  it('海滩标签推导出泳衣与沙滩巾', () => {
    const out = suggestPacking({ ...base, poiTypes: ['beach'], tags: ['swim'] }).map((o) => o.text);
    expect(out).toContain('泳衣');
    expect(out).toContain('沙滩巾');
  });

  it('徒步标签推导出徒步鞋与水壶', () => {
    const out = suggestPacking({ ...base, poiTypes: ['mountain'], tags: ['hike'] }).map((o) => o.text);
    expect(out).toContain('徒步鞋');
    expect(out).toContain('水壶');
  });

  it('个人行李按成员数复制成每人一份', () => {
    const passports = suggestPacking(base).filter((o) => o.text === '护照 / 身份证');
    expect(passports.length).toBe(2);
    expect(passports.every((p) => p.ownerId === 'm1' || p.ownerId === 'm2')).toBe(true);
  });

  it('公共项只生成一份且 ownerId 为 null', () => {
    const out = suggestPacking(base);
    const plug = out.filter((o) => o.text.includes('转换插头'));
    const share = out.filter((o) => o.text.includes('共用物品分摊'));
    expect(plug.length).toBe(1);
    expect(plug[0]!.ownerId).toBeNull();
    expect(share.length).toBe(1);
    expect(share[0]!.ownerId).toBeNull();
  });

  it('单人（ownerIds 空）个人项归 null 且不复制，无分摊项', () => {
    const out = suggestPacking({ ...base, ownerIds: [] });
    const passports = out.filter((o) => o.text === '护照 / 身份证');
    expect(passports.length).toBe(1);
    expect(passports[0]!.ownerId).toBeNull();
    expect(out.some((o) => o.text.includes('共用物品分摊'))).toBe(false);
  });

  it('天数最少按 1 计', () => {
    expect(suggestPacking({ ...base, days: 0 }).some((o) => o.text === '内衣 ×1')).toBe(true);
  });

  it('无月份时上衣/外套为通用文案（向后兼容）', () => {
    const out = suggestPacking(base).map((o) => o.text);
    expect(out).toContain('长袖上衣 ×6');
    expect(out).toContain('外套 / 防风层');
  });

  it('瑞士 1 月（寒冬）推导出保暖衣物 + 厚袜，且无雨具', () => {
    const out = suggestPacking({ ...base, countries: ['ch'], month: 1 }).map((o) => o.text);
    expect(out).toContain('保暖长袖 + 打底 ×6');
    expect(out).toContain('保暖外套 / 羽绒 + 手套 + 围巾');
    expect(out).toContain('保暖鞋 / 厚袜');
    expect(out.some((t) => t.includes('折叠伞'))).toBe(false);
  });

  it('意大利 7 月（盛夏）推导出短袖 + 防晒薄衫，且无雨具', () => {
    const out = suggestPacking({ ...base, countries: ['it'], month: 7 }).map((o) => o.text);
    expect(out).toContain('短袖 / 透气上衣 ×6');
    expect(out).toContain('防晒薄衫（备用）');
    expect(out.some((t) => t.includes('折叠伞'))).toBe(false);
  });

  it('法国 9 月（初秋多雨）推导出薄外套 + 雨具', () => {
    const out = suggestPacking({ ...base, countries: ['fr'], month: 9 }).map((o) => o.text);
    expect(out).toContain('薄外套（早晚凉）');
    expect(out).toContain('折叠伞 / 防水鞋');
  });

  it('气候带随主要目的地国家变化（同月不同国）', () => {
    const swiss = suggestPacking({ ...base, countries: ['ch'], month: 9 }).map((o) => o.text);
    const french = suggestPacking({ ...base, countries: ['fr'], month: 9 }).map((o) => o.text);
    // 瑞士 9 月已偏冷（cool），法国 9 月仍温和（mild）
    expect(swiss).toContain('外套 / 薄毛衣');
    expect(french).toContain('薄外套（早晚凉）');
  });
});
