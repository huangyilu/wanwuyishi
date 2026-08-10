/**
 * 日期重映射 —— "无脑跟随"的核心：
 * 跟随者选一个自己的出发日，整份行程平移，平移后立刻做闭馆日校验。
 *
 * 纯函数，不碰数据库，方便在前端预览"改期后会撞哪些坑"再决定是否确认。
 */
import { addDays, diffDays } from '../date';
import { checkClosures, type ClosureCheckable, type ClosureConflict } from './closure-check';

export interface RemappableDay {
  id: string;
  date: string;
  cityId?: string | null;
  poiIds: string[];
}

export interface RemapResult {
  offsetDays: number;
  days: RemappableDay[];
  conflicts: ClosureConflict[];
  /** 原行程里就已经存在的冲突，用于区分"是我改出来的"还是"人家本来就有" */
  preexistingConflicts: ClosureConflict[];
}

export function remapTripDates(
  days: RemappableDay[],
  newStartDate: string,
  poiIndex: Record<string, ClosureCheckable>,
): RemapResult {
  if (days.length === 0) {
    return { offsetDays: 0, days: [], conflicts: [], preexistingConflicts: [] };
  }

  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const oldStart = sorted[0]!.date;
  const offsetDays = diffDays(oldStart, newStartDate);

  const shifted = sorted.map((d) => ({ ...d, date: addDays(d.date, offsetDays) }));

  const scheduleOf = (list: RemappableDay[]) =>
    list.flatMap((d) =>
      d.poiIds
        .map((id) => poiIndex[id])
        .filter((p): p is ClosureCheckable => Boolean(p))
        .map((poi) => ({ date: d.date, poi })),
    );

  return {
    offsetDays,
    days: shifted,
    conflicts: checkClosures(scheduleOf(shifted), shifted.map((d) => d.date)),
    preexistingConflicts: checkClosures(scheduleOf(sorted), sorted.map((d) => d.date)),
  };
}
