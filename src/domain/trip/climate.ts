/**
 * 月度气候带（常识性概览，非具体日预报）。
 *
 * 用途：打包助手在「行前规划」阶段无法获取实时天气（免费预报窗口仅未来 16 天，
 * 而行程往往是数月后）。这里内置欧洲主要目的地的月度气候带，让衣物建议从
 * 「纯按天数」升级为「按行程月份 + 目的地」推导——不臆测单日温度，只给气候分层。
 *
 * 数据为公开常识性月度气候（温带/南欧/阿尔卑斯三套），零成本、可离线、可单测。
 */

export type ClimateBand = 'cold' | 'cool' | 'mild' | 'warm' | 'hot';
export interface ClimateInfo {
  band: ClimateBand;
  /** 展示文案，如「初秋·温和，多雨」 */
  label: string;
  rain: boolean;
}

const BAND_LABEL: Record<ClimateBand, string> = {
  cold: '寒冷',
  cool: '偏凉',
  mild: '温和',
  warm: '温暖',
  hot: '炎热',
};

const MONTH_SEASON = [
  '隆冬', '冬末', '初春', '仲春', '暮春', '初夏',
  '盛夏', '夏末', '初秋', '仲秋', '暮秋', '初冬',
];

/** 法国 —— 温带海洋性，南北差异温和（12 个月，1-12 月顺序） */
const FR: { bands: ClimateBand[]; rain: boolean[] } = {
  bands: ['cool', 'cool', 'cool', 'mild', 'mild', 'warm', 'warm', 'warm', 'mild', 'mild', 'cool', 'cool'],
  rain: [true, true, true, true, true, false, false, false, true, true, true, true],
};
/** 意大利 —— 南欧偏暖，夏热冬温 */
const IT: { bands: ClimateBand[]; rain: boolean[] } = {
  bands: ['cool', 'cool', 'mild', 'mild', 'warm', 'hot', 'hot', 'hot', 'warm', 'mild', 'cool', 'cool'],
  rain: [true, true, true, false, false, false, false, false, true, true, true, true],
};
/** 瑞士 —— 阿尔卑斯偏冷，山区尤甚，夏短；冬季多雪（不列雨具，给保暖） */
const CH: { bands: ClimateBand[]; rain: boolean[] } = {
  bands: ['cold', 'cold', 'cool', 'cool', 'mild', 'mild', 'warm', 'warm', 'cool', 'cool', 'cold', 'cold'],
  rain: [false, false, true, true, true, true, true, true, true, true, true, false],
};

const DATA: Record<string, { bands: ClimateBand[]; rain: boolean[] }> = { fr: FR, it: IT, ch: CH };

/** 取某国某月的气候信息；国家未知时兜底法国（温带），月份越界则取模。 */
export function climateFor(country: string, month: number): ClimateInfo {
  const m = (((month - 1) % 12) + 12) % 12; // 0-11
  const key = country.trim().toLowerCase();
  const row = DATA[key] ?? FR;
  const band = row.bands[m] ?? 'mild';
  const rain = row.rain[m] ?? false;
  const label = `${MONTH_SEASON[m]}·${BAND_LABEL[band]}${rain ? '，多雨' : ''}`;
  return { band, label, rain };
}
