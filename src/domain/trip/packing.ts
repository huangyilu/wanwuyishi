/**
 * 打包助手 · 智能清单生成（纯函数，可单测）。
 *
 * 零成本约束：不调实时天气 API（免费预报窗口仅未来 16 天，行前数月规划查不到）。
 * 改用「行程月份 + 目的地」的月度气候带（见 climate.ts）推导衣物分层；
 * 活动相关项依据行程里 POI 的类型 / 标签推导（海滩→泳衣、徒步→徒步鞋…）。
 * 插座类型按目的地国家给通用提示。
 *
 * 输出为「建议草稿」，具体勾选 / 负责人 / 增删在 UI 层完成。
 */

import { climateFor, type ClimateBand } from './climate';

export const PACK_CATS = ['证件/票据', '衣物', '洗漱', '电子', '药品', '其他'] as const;
export type PackCat = (typeof PACK_CATS)[number];

export interface PackingSuggestion {
  category: PackCat;
  text: string;
  note?: string;
}

export interface PackingContext {
  /** 行程天数（按已建的天数，最少 1） */
  days: number;
  /** 目的地国家代码集合（ISO alpha-2，小写，如 fr/it/ch） */
  countries: string[];
  /** 目的地货币集合（来自世界库 CountrySummary.currency） */
  currencies: string[];
  /** 已排 POI 的类型集合 */
  poiTypes: string[];
  /** 已排 POI 的标签集合 */
  tags: string[];
  /** 同行人数 */
  memberCount: number;
  /** 行程起始月份（1-12）；用于按月气候带推导衣物。缺省则退化为通用建议 */
  month?: number;
}

/** 按气候带给出「上衣」文案 */
function topsByBand(band: ClimateBand | undefined, n: number): string {
  switch (band) {
    case 'hot':
      return `短袖 / 透气上衣 ×${n}`;
    case 'warm':
      return `短袖 + 薄长袖 ×${n}`;
    case 'cold':
      return `保暖长袖 + 打底 ×${n}`;
    default:
      return `长袖上衣 ×${n}`;
  }
}

/** 按气候带给出「外套」文案 */
function coatByBand(band: ClimateBand | undefined): string {
  switch (band) {
    case 'cold':
      return '保暖外套 / 羽绒 + 手套 + 围巾';
    case 'cool':
      return '外套 / 薄毛衣';
    case 'mild':
      return '薄外套（早晚凉）';
    case 'warm':
      return '轻薄外套（空调 / 夜晚）';
    case 'hot':
      return '防晒薄衫（备用）';
    default:
      return '外套 / 防风层';
  }
}

export function suggestPacking(opts: PackingContext): PackingSuggestion[] {
  const out: PackingSuggestion[] = [];
  const d = Math.max(1, opts.days);
  const cli = opts.month ? climateFor(opts.countries[0] ?? 'fr', opts.month) : undefined;
  const D = '证件/票据' as PackCat;
  const C = '衣物' as PackCat;
  const W = '洗漱' as PackCat;
  const E = '电子' as PackCat;
  const M = '药品' as PackCat;
  const O = '其他' as PackCat;

  /* 证件 / 票据 */
  out.push({ category: D, text: '护照 / 身份证' });
  out.push({ category: D, text: '签证 / 入境许可', note: opts.countries.length ? '出发前核对清单' : undefined });
  out.push({ category: D, text: '机票 / 酒店确认单' });
  out.push({ category: D, text: '旅行保险单' });
  if (opts.currencies.length) {
    out.push({ category: D, text: `当地现金（${[...new Set(opts.currencies)].join('/')}）+ 信用卡` });
  }

  /* 电子 */
  out.push({ category: E, text: '手机 + 充电器' });
  out.push({ category: E, text: '充电宝' });
  out.push({ category: E, text: '相机 / 存储卡' });
  if (opts.countries.length) {
    out.push({ category: E, text: '转换插头（按目的地插座类型准备）' });
  }

  /* 衣物（按天数 + 行程月份气候带推导） */
  out.push({ category: C, text: `内衣 ×${d}` });
  out.push({ category: C, text: `袜子 ×${d + 1}` });
  out.push({ category: C, text: topsByBand(cli?.band, d + 1) });
  out.push({ category: C, text: coatByBand(cli?.band) });
  if (cli?.band === 'cold') {
    out.push({ category: C, text: '保暖鞋 / 厚袜' });
  }
  if (cli?.rain) {
    out.push({ category: C, text: '折叠伞 / 防水鞋' });
  }
  out.push({ category: C, text: '舒适步行鞋' });

  /* 洗漱 */
  out.push({ category: W, text: '牙具 / 护肤小样' });
  out.push({ category: W, text: '防晒霜' });

  /* 药品 */
  out.push({ category: M, text: '常用药 + 肠胃药' });
  out.push({ category: M, text: '创可贴' });

  /* 活动相关（依据 POI 类型 / 标签） */
  const t = new Set([...opts.poiTypes, ...opts.tags]);
  if (t.has('beach') || t.has('swim') || t.has('海岛') || t.has('lake')) {
    out.push({ category: C, text: '泳衣' });
    out.push({ category: O, text: '沙滩巾' });
  }
  if (t.has('hike') || t.has('mountain') || t.has('trail') || t.has('徒步') || t.has('alps')) {
    out.push({ category: C, text: '徒步鞋' });
    out.push({ category: O, text: '水壶' });
  }

  /* 多人协作 */
  if (opts.memberCount > 1) {
    out.push({ category: O, text: `共用物品分摊（${opts.memberCount} 人）`, note: '在每条上指定负责人' });
  }

  return out;
}
