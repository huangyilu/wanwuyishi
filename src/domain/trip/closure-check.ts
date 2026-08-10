/**
 * 闭馆日校验 —— 这是"玩无一失"这个名字最该兑现的地方。
 *
 * 触发时机：
 *   1. 把 POI 拖进某一天时立即校验
 *   2. 整体平移行程日期时（无脑跟随的日期重映射）批量校验
 *   3. 行前体检时全量复查
 *
 * 依赖 POI 的 openness 结构化字段，绝不解析 volatile.hours 里的自然语言。
 */
import { monthDay, weekday, weekdayLabel } from '../date';
import type { Openness } from '../world/schema';

export type ClosureReason = 'weekday' | 'date' | 'seasonal';

export interface ClosureConflict {
  poiId: string;
  poiName: string;
  date: string;
  reason: ClosureReason;
  message: string;
  /** 同一周内可替换的日期（已排除其它闭馆规则），供"一键改期"使用 */
  suggestions: string[];
}

export interface ClosureCheckable {
  id: string;
  name: string;
  openness: Openness;
}

/** 季节性区间支持跨年（如 11-15 → 03-31） */
function inSeason(md: string, from: string, to: string): boolean {
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/** 单个 POI 在指定日期是否闭馆 */
export function isClosedOn(
  openness: Openness,
  date: string,
): { closed: boolean; reason?: ClosureReason; detail?: string } {
  if (openness.closedDates.includes(date)) {
    return { closed: true, reason: 'date', detail: `${date} 为固定闭馆日` };
  }
  if (openness.closedWeekdays.includes(weekday(date))) {
    return { closed: true, reason: 'weekday', detail: `每${weekdayLabel(date)}闭馆` };
  }
  for (const s of openness.seasonal) {
    if (!inSeason(monthDay(date), s.from, s.to)) {
      return { closed: true, reason: 'seasonal', detail: s.note };
    }
  }
  return { closed: false };
}

/**
 * 在候选日期里挑出该 POI 开放的日子。
 * 用于"卢浮宫被排到周二，建议改到 9/21 或 9/23"这类可执行建议。
 */
export function openDatesAmong(openness: Openness, candidates: string[]): string[] {
  return candidates.filter((d) => !isClosedOn(openness, d).closed);
}

export interface ScheduledPoi {
  date: string;
  poi: ClosureCheckable;
}

/**
 * 批量校验一份日程。
 * `tripDates` 传整趟行程的日期列表，用于给出同程内的改期建议。
 */
export function checkClosures(
  scheduled: ScheduledPoi[],
  tripDates: string[] = [],
): ClosureConflict[] {
  const out: ClosureConflict[] = [];
  for (const { date, poi } of scheduled) {
    const r = isClosedOn(poi.openness, date);
    if (!r.closed) continue;
    const suggestions = openDatesAmong(
      poi.openness,
      tripDates.filter((d) => d !== date),
    ).slice(0, 3);
    out.push({
      poiId: poi.id,
      poiName: poi.name,
      date,
      reason: r.reason!,
      message:
        `${poi.name} 被排在 ${date}（${weekdayLabel(date)}），${r.detail}` +
        (suggestions.length ? `，建议改到 ${suggestions.join(' / ')}` : '，本次行程内没有可替换的日期'),
      suggestions,
    });
  }
  return out;
}
