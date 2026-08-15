/**
 * 行程合理性体检 —— 地图预览之外的第二道"别踩坑"防线。
 *
 * 只纳入 status === 'confirmed' 的行程项（候选/心愿单/已放弃/已游览均不计入）。
 *
 * 四类检查：
 *   closure   闭馆撞车（复用 closure-check）
 *   overpack  一天排太满（游览时长 + 步行转场时间 > 可用时长）
 *   zigzag    折返跑（当日点位路径明显绕路）
 *   booking   预约死线（距出发不足 leadDays 且票未订）
 *
 * 全部为纯函数，输入是"行程 + POI 快照"，输出是可直接渲染的问题列表。
 */
import { diffDays } from '../date';
import { checkClosures, type ClosureCheckable } from './closure-check';

export type IssueLevel = 'error' | 'warn' | 'info';

export interface SanityIssue {
  level: IssueLevel;
  kind: 'closure' | 'overpack' | 'zigzag' | 'booking';
  date?: string;
  itemId?: string;
  poiId?: string;
  message: string;
}

export interface CheckPoi extends ClosureCheckable {
  location: { lat: number; lng: number };
  /** [下限, 上限] 分钟 */
  durationMinutes: [number, number];
  booking?: { required: boolean; leadDays: number } | null;
}

export interface CheckItem {
  id: string;
  poiId: string | null;
  status: string;
  hasTicket: boolean;
}

export interface CheckDay {
  date: string;
  items: CheckItem[];
}

export interface SanityOptions {
  /** 一天可用于游览的分钟数，默认 9 小时 */
  availableMinutesPerDay?: number;
  /** 平均步行速度 km/h，用于估算转场 */
  walkKmh?: number;
  /** 今天，用于预约死线判断 */
  today?: string;
}

/** 半正矢公式，返回公里 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 路径总长与"首尾直线距离"的比值，用来发现折返 */
export function pathStats(points: Array<{ lat: number; lng: number }>): {
  totalKm: number;
  spanKm: number;
  detourRatio: number;
} {
  if (points.length < 2) return { totalKm: 0, spanKm: 0, detourRatio: 1 };
  let totalKm = 0;
  for (let i = 1; i < points.length; i++) totalKm += distanceKm(points[i - 1]!, points[i]!);
  const spanKm = distanceKm(points[0]!, points[points.length - 1]!);
  return { totalKm, spanKm, detourRatio: spanKm > 0.2 ? totalKm / spanKm : 1 };
}

export function sanityCheck(
  days: CheckDay[],
  poiIndex: Record<string, CheckPoi>,
  opts: SanityOptions = {},
): SanityIssue[] {
  const available = opts.availableMinutesPerDay ?? 9 * 60;
  const walkKmh = opts.walkKmh ?? 4.5;
  const issues: SanityIssue[] = [];
  const tripDates = days.map((d) => d.date);

  // 1. 闭馆
  // 只体检「确定」的行程项；候选/心愿单/已放弃/已游览都不计入。
  const scheduled = days.flatMap((d) =>
    d.items
      .filter((it) => it.status === 'confirmed')
      .map((it) => (it.poiId ? poiIndex[it.poiId] : undefined))
      .filter((p): p is CheckPoi => Boolean(p))
      .map((poi) => ({ date: d.date, poi })),
  );
  for (const c of checkClosures(scheduled, tripDates)) {
    issues.push({ level: 'error', kind: 'closure', date: c.date, poiId: c.poiId, message: c.message });
  }

  for (const day of days) {
    const pois = day.items
      .filter((it) => it.status === 'confirmed')
      .map((it) => (it.poiId ? poiIndex[it.poiId] : undefined))
      .filter((p): p is CheckPoi => Boolean(p));
    if (pois.length === 0) continue;

    // 2. 排太满：取游览时长下限 + 步行转场，仍然超时才报警（避免过度提示）
    const visitMinutes = pois.reduce((s, p) => s + p.durationMinutes[0], 0);
    let transferMinutes = 0;
    for (let i = 1; i < pois.length; i++) {
      const km = distanceKm(pois[i - 1]!.location, pois[i]!.location);
      transferMinutes += Math.round((km / walkKmh) * 60) + 10; // 10 分钟固定损耗
    }
    const total = visitMinutes + transferMinutes;
    if (total > available) {
      issues.push({
        level: total > available * 1.25 ? 'error' : 'warn',
        kind: 'overpack',
        date: day.date,
        message:
          `${day.date} 排了 ${pois.length} 个点，按最短游览时长估算需要 ` +
          `${(total / 60).toFixed(1)} 小时（含转场 ${transferMinutes} 分钟），` +
          `超过一天可用的 ${(available / 60).toFixed(0)} 小时。`,
      });
    }

    // 3. 折返跑
    const stats = pathStats(pois.map((p) => p.location));
    if (pois.length >= 3 && stats.totalKm > 6 && stats.detourRatio > 2.2) {
      issues.push({
        level: 'warn',
        kind: 'zigzag',
        date: day.date,
        message:
          `${day.date} 当日路线总长 ${stats.totalKm.toFixed(1)} 公里，` +
          `是首尾直线距离的 ${stats.detourRatio.toFixed(1)} 倍，可能在走回头路，建议调整顺序。`,
      });
    }
  }

  // 4. 预约死线
  const today = opts.today;
  if (today) {
    for (const day of days) {
      for (const item of day.items) {
        const poi = item.poiId ? poiIndex[item.poiId] : undefined;
        if (!poi?.booking?.required || item.hasTicket) continue;
        if (item.status !== 'confirmed') continue;
        const daysLeft = diffDays(today, day.date);
        const lead = poi.booking.leadDays;
        if (daysLeft < 0) continue;
        if (daysLeft <= lead) {
          issues.push({
            level: daysLeft <= Math.ceil(lead / 2) ? 'error' : 'warn',
            kind: 'booking',
            date: day.date,
            itemId: item.id,
            poiId: poi.id,
            message:
              `${poi.name} 建议提前 ${lead} 天预约，距离 ${day.date} 只剩 ${daysLeft} 天，还没有票券记录。`,
          });
        }
      }
    }
  }

  const order: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}
