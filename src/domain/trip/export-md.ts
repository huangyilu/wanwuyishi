/**
 * 把一份行程编译成 Markdown 行程单（纯函数，100% 单测）。
 *
 * 导出范围 = 行程本体：每日排期（POI / 交通段 / 备注，含时间、状态、备注）+ 候选池。
 * 刻意不含账本与打包清单（那是另一份交付物）。
 *
 * 设计要点：
 * - 纯函数：输入 TripBundle + 世界库查表，输出字符串，不碰 DOM / 不依赖 React。
 * - 可追溯：顶部标注「信息来自规划快照，易变信息以官方为准」，贴合项目「不保证实时性 → 改可追溯」的底线。
 */
import type { CitySummary, CountrySummary, TripBundle, TripItem } from '../../data/types';
import type { Poi } from '../world/schema';
import { byRank } from './rank';
import { formatCn, weekdayLabel } from '../date';

/** 条目状态 → md 展示标签（emoji 跨平台，纯文本阅读器也能看懂） */
const STATUS_MD: Record<string, string> = {
  confirmed: '✅ 已定',
  candidate: '🕓 待定',
  wishlist: '💭 想去',
  visited: '✓ 已游',
  dropped: '✕ 放弃',
};

/** 交通方式 → md 展示标签 */
const TRANSPORT_MD: Record<string, string> = {
  train: '🚄 火车',
  flight: '✈️ 飞机',
  bus: '🚌 巴士',
  ferry: '⛴️ 渡轮',
  car: '🚗 自驾',
  walk: '🚶 步行',
  other: '🔁 其他',
};

/** 行程状态 → 中文 */
const TRIP_STATUS_MD: Record<string, string> = {
  planning: '规划中',
  ongoing: '进行中',
  finished: '已结束',
  archived: '已归档',
};

export interface MdLookups {
  poiMap: Record<string, Poi>;
  cities: CitySummary[];
  countries: CountrySummary[];
}

function poiLabel(poi: Poi | undefined): string {
  if (!poi) return '（未知景点）';
  const extra = poi.localName && poi.localName !== poi.name ? `（${poi.localName}）` : '';
  return `${poi.name}${extra}`;
}

function cityLabel(cities: CitySummary[], id?: string | null): string {
  if (!id) return '';
  return cities.find((c) => c.id === id)?.name ?? '';
}

function timeRange(item: TripItem): string {
  if (item.slotStart && item.slotEnd) return `${item.slotStart}–${item.slotEnd}`;
  if (item.slotStart) return item.slotStart;
  return '';
}

function renderItem(it: TripItem, poiMap: Record<string, Poi>, cities: CitySummary[]): string {
  const kind = it.kind ?? 'poi';
  const status = STATUS_MD[it.status] ?? it.status;
  const time = timeRange(it);
  const timePrefix = time ? `⏰ **${time}** ` : '';

  if (kind === 'transport') {
    const from = cityLabel(cities, it.fromCityId);
    const to = cityLabel(cities, it.toCityId);
    const mode = TRANSPORT_MD[it.transportMode ?? 'other'] ?? TRANSPORT_MD.other;
    const route = [from, to].filter(Boolean).join(' → ') || '（未填起讫）';
    let line = `- ${mode} ${route}`;
    if (time) line += ` · ${time}`;
    line += ` · ${status}`;
    if (it.note) line += `\n  - 备注：${it.note}`;
    return line;
  }

  if (kind === 'note') {
    return `- 📝 ${it.note || '（空备注）'}`;
  }

  if (kind === 'accommodation') {
    const city = cityLabel(cities, it.toCityId);
    let line = `- 🏨 ${it.customTitle || '住宿'}`;
    if (city) line += ` · ${city}`;
    if (time) line += ` · ${time}`;
    line += ` · ${status}`;
    if (it.note) line += `\n  - 预订：${it.note}`;
    return line;
  }

  // poi / 自定义标题
  const poi = it.poiId ? poiMap[it.poiId] : undefined;
  const name = it.customTitle || poiLabel(poi);
  let line = `- ${timePrefix}**${name}** · ${status}`;
  if (it.note) line += `\n  - 备注：${it.note}`;
  return line;
}

/**
 * 把行程编译成 Markdown 字符串。
 * @param bundle 一次拿全的行程数据
 * @param lookups 世界库查表结果（POI / 城市 / 国家），用于把 id 翻成可读名字
 */
export function tripToMarkdown(bundle: TripBundle, lookups: MdLookups): string {
  const { trip, members, days, items } = bundle;
  const { poiMap, cities } = lookups;

  const lines: string[] = [];
  lines.push(`# ${trip.title} · 行程单`);
  lines.push('');
  lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  const dateRange = [trip.startDate, trip.endDate].filter(Boolean).join(' – ');
  lines.push(
    `> 行程：${dateRange || '未设定日期'}${days.length ? `（共 ${days.length} 天）` : ''}`,
  );
  lines.push(`> 同行：${members.map((m) => m.displayName).join('、') || '—'}`);
  lines.push(`> 状态：${TRIP_STATUS_MD[trip.status] ?? trip.status}`);
  lines.push('');
  lines.push('> ⚠️ 行程信息来自规划快照，票价 / 开放时间等易变信息以官方为准。');
  lines.push('');

  const sortedDays = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sortedDays.length) {
    lines.push('## 每日行程');
    lines.push('');
    sortedDays.forEach((day, idx) => {
      lines.push(`### Day ${idx + 1} · ${formatCn(day.date)} ${weekdayLabel(day.date)}`);
      const city = cityLabel(cities, day.cityId);
      if (city) lines.push(`📍 ${city}`);
      lines.push('');
      const dayItems = items.filter((i) => i.dayId === day.id).sort(byRank);
      if (!dayItems.length) {
        lines.push('_（这天还没排点）_');
        lines.push('');
      } else {
        for (const it of dayItems) {
          lines.push(renderItem(it, poiMap, cities));
        }
        lines.push('');
      }
    });
  }

  const pool = items.filter((i) => !i.dayId).sort(byRank);
  if (pool.length) {
    lines.push('## 候选池（尚未排期）');
    lines.push('');
    for (const it of pool) {
      lines.push(renderItem(it, poiMap, cities));
    }
    lines.push('');
  }

  return lines.join('\n');
}
