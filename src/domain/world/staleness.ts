/**
 * 时效性判定 —— 落实"不承诺实时，只承诺可追溯"。
 *
 * 产品规则：超过 90 天未核实即显示"信息可能过期"，
 * 且任何情况下都要给出一键到达官方源的入口。
 */
import { diffDays, todayStr } from '../date';

export const STALE_DAYS = 90;
export const VERY_STALE_DAYS = 180;

export type Freshness = 'fresh' | 'stale' | 'very-stale';

export interface FreshnessInfo {
  level: Freshness;
  days: number;
  label: string;
  /** 是否需要在界面上显示警示条 */
  warn: boolean;
}

export function freshnessOf(verifiedAt: string, today: string = todayStr()): FreshnessInfo {
  const days = Math.max(0, diffDays(verifiedAt, today));
  if (days >= VERY_STALE_DAYS) {
    return { level: 'very-stale', days, label: `${days} 天未核实，务必点官方源确认`, warn: true };
  }
  if (days >= STALE_DAYS) {
    return { level: 'stale', days, label: `${days} 天未核实，信息可能已过期`, warn: true };
  }
  return { level: 'fresh', days, label: `${days} 天前核实`, warn: false };
}

export interface VerifiableLike {
  value: string;
  source: string;
  verifiedAt: string;
}

/** 取一组易变字段里最旧的一条，用于卡片头部的整体时效标记 */
export function oldestVerification(
  fields: Array<VerifiableLike | undefined | null>,
  today: string = todayStr(),
): FreshnessInfo | null {
  const dates = fields.filter((f): f is VerifiableLike => Boolean(f)).map((f) => f.verifiedAt);
  if (dates.length === 0) return null;
  const oldest = dates.reduce((a, b) => (a < b ? a : b));
  return freshnessOf(oldest, today);
}
