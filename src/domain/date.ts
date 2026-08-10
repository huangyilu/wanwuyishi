/**
 * 纯字符串日期工具（YYYY-MM-DD）。
 *
 * 为什么不用 Date 对象：行程日期是"日历上的那一天"，不是时刻。
 * 用户在北京规划欧洲行程时，`new Date('2026-09-20')` 按 UTC 解析后
 * 在本地时区可能落回 9 月 19 日 —— 这是跨时区规划的高发 bug。
 * 所有行程日期一律以字符串流转，只在这里做一次 UTC 内部换算。
 */

export type IsoDateStr = string;

const MS_PER_DAY = 86_400_000;

function toUtc(d: IsoDateStr): number {
  return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
}

function fromUtc(ms: number): IsoDateStr {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return fromUtc(toUtc(d)) === d;
}

export function addDays(d: IsoDateStr, n: number): IsoDateStr {
  return fromUtc(toUtc(d) + n * MS_PER_DAY);
}

export function diffDays(from: IsoDateStr, to: IsoDateStr): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

/** 0=周日 … 6=周六，与 openness.closedWeekdays 对齐 */
export function weekday(d: IsoDateStr): number {
  return new Date(toUtc(d)).getUTCDay();
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export function weekdayLabel(d: IsoDateStr): string {
  return WEEKDAY_CN[weekday(d)] ?? '';
}

/** "09-20"，用于季节性开放区间比较 */
export function monthDay(d: IsoDateStr): string {
  return d.slice(5);
}

export function todayStr(now: Date = new Date()): IsoDateStr {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 生成闭区间内的所有日期 */
export function dateRange(from: IsoDateStr, to: IsoDateStr): IsoDateStr[] {
  const out: IsoDateStr[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export function formatCn(d: IsoDateStr): string {
  return `${+d.slice(5, 7)}月${+d.slice(8, 10)}日`;
}
