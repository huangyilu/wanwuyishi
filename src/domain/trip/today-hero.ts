/**
 * 「今天」tab 空档推导 —— 纯函数，无 React、无副作用。
 *
 * 输入一份行程 + 世界库索引，输出一个可直接渲染的「出发倒计时 + 准备提醒」：
 * - 若今天命中某天 → matched=true，由上层正常渲染当天，本函数不出文案。
 * - 若今天不在任何一天 → 取绝对天数最近的一天做倒计时，并推导可 actionable 的提醒
 *   （待订票 / 打包未完成 / 需办签证 / 目的地货币）。
 *
 * 抽成纯函数便于单测，也避免把算法埋进组件里。
 */
import { diffDays, formatCn, weekdayLabel } from '../date';
import type { Poi } from '../world/schema';
import type { CitySummary, CountrySummary, TripBundle } from '../../data/types';

export interface TodayReminder {
  icon: string;
  /** 卡片小标题，2-4 字。如"待订票" / "打包" / "签证" / "货币" */
  kicker: string;
  /** 卡片正文，描述具体待办 */
  text: string;
  warn?: boolean;
  /** 点击这张卡该跳到哪：跳到 packing / ledger tab，或定位到某天 */
  action:
    | { kind: 'tab'; tab: 'packing' | 'ledger' }
    | { kind: 'day'; dayId: string };
}

export interface TodayHero {
  /** 今天是否命中某天；命中时上层应正常渲染当天，不显示本 hero */
  matched: boolean;
  headline: string;
  sub: string;
  reminders: TodayReminder[];
}

export interface TodayHeroInput {
  today: string;
  bundle: TripBundle;
  poiMap?: Record<string, Poi> | undefined;
  cities: CitySummary[];
  countries: CountrySummary[];
}

export function computeTodayHero({ today, bundle, poiMap, cities, countries }: TodayHeroInput): TodayHero {
  const days = [...bundle.days].sort((a, b) => (a.date < b.date ? -1 : 1));

  if (days.some((d) => d.date === today)) {
    return { matched: true, headline: '', sub: '', reminders: [] };
  }

  // 1) 倒计时：绝对天数最近的一天
  let nearest = days[0];
  let best = Infinity;
  for (const d of days) {
    const x = Math.abs(diffDays(today, d.date));
    if (x < best) {
      best = x;
      nearest = d;
    }
  }
  const delta = nearest ? diffDays(today, nearest.date) : 0;
  const cityName = nearest
    ? (nearest.cityId ? cities.find((c) => c.id === nearest.cityId)?.name : '') || nearest.customCity || ''
    : '';
  const when = nearest ? `${formatCn(nearest.date)} ${weekdayLabel(nearest.date)}` : '';
  const headline = !nearest
    ? '还没排期'
    : delta > 0
      ? `还有 ${delta} 天`
      : `已过去 ${-delta} 天`;
  const sub = !nearest ? '回作战台给行程加几天吧' : `${when}${cityName ? ` · ${cityName}` : ''}`;

  // 2) 准备提醒
  const reminders: TodayReminder[] = [];

  const unbooked = bundle.items.filter((it) => {
    if (it.kind && it.kind !== 'poi') return false;
    const poi = it.poiId ? poiMap?.[it.poiId] : undefined;
    if (!poi?.booking?.required) return false;
    const tk = bundle.tickets.find((t) => t.itemId === it.id);
    return !tk?.booked;
  });
  if (unbooked.length > 0) {
    const names = unbooked
      .slice(0, 3)
      .map((it) => poiMap?.[it.poiId ?? '']?.name)
      .filter(Boolean) as string[];
    reminders.push({
      icon: '🎫',
      kicker: '待订票',
      text: `${unbooked.length} 个景点待订票${names.length ? `：${names.join('、')}` : ''}`,
      warn: true,
      action: nearest
        ? { kind: 'day', dayId: nearest.id }
        : { kind: 'tab', tab: 'packing' },
    });
  }

  const undone = bundle.trip.packing.filter((p) => !p.done);
  if (undone.length > 0) {
    const docs = undone.filter((p) => p.category === '证件' || p.category === '票据');
    const tail = docs.length ? `，证件类 ${docs.length} 件未装` : '';
    reminders.push({
      icon: '🎒',
      kicker: '打包',
      text: `打包清单还剩 ${undone.length} 件未勾${tail}`,
      action: { kind: 'tab', tab: 'packing' },
    });
  }

  const countryIds = new Set(
    days
      .map((d) => (d.cityId ? cities.find((c) => c.id === d.cityId)?.country : undefined))
      .filter(Boolean) as string[],
  );
  const visaCountries = [...countryIds]
    .map((id) => countries.find((c) => c.id === id))
    .filter((c) => c?.hasVisa);
  if (visaCountries.length > 0) {
    const names = visaCountries.map((c) => c!.name).join('、');
    reminders.push({
      icon: '🛂',
      kicker: '签证',
      text: `需办理 ${names} 签证，确认护照有效期 ≥ 6 个月`,
      warn: true,
      action: nearest
        ? { kind: 'day', dayId: nearest.id }
        : { kind: 'tab', tab: 'packing' },
    });
  }

  if (bundle.trip.baseCurrency && bundle.trip.baseCurrency !== 'CNY') {
    reminders.push({
      icon: '💶',
      kicker: '货币',
      text: `目的地货币 ${bundle.trip.baseCurrency}，记得换汇 / 开通免货币转换费银行卡`,
      action: { kind: 'tab', tab: 'ledger' },
    });
  }

  return { matched: false, headline, sub, reminders };
}
