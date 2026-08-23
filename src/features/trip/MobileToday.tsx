/**
 * 移动端「今天」tab 的紧凑视图。
 *
 * 出发点：手机不是规划用的，是「在路上用的」。所以这一屏只做三件事：
 *   1) 让人一眼看出"现在离出发还多久 / 下一站在哪"
 *   2) 列出可点过去完成的准备项（订票 / 打包 / 签证 / 货币），每张都是入口不是废话
 *   3) 如果今天正好落在某天，下面再接一份当日速览
 *
 * 算法仍在 domain/trip/today-hero.ts 的 computeTodayHero 里（纯函数 + 单测）。
 */
import { todayStr } from '../../domain/date';
import { computeTodayHero, type TodayHero } from '../../domain/trip/today-hero';
import type { Poi } from '../../domain/world/schema';
import type { CitySummary, CountrySummary, TripBundle } from '../../data/types';
import s from './MobileTrip.module.css';

export type TodayAction =
  | { kind: 'tab'; tab: 'packing' | 'ledger' }
  | { kind: 'day'; dayId: string };

export function MobileToday({
  bundle,
  poiMap,
  cities,
  countries,
  onAction,
}: {
  bundle: TripBundle;
  poiMap: Record<string, Poi> | undefined;
  cities: CitySummary[];
  countries: CountrySummary[];
  onAction?: (a: TodayAction) => void;
}) {
  const hero = computeTodayHero({ today: todayStr(), bundle, poiMap, cities, countries });
  if (hero.matched) return null;

  return <TodayHeroView hero={hero} onAction={onAction} />;
}

function TodayHeroView({ hero, onAction }: { hero: TodayHero; onAction?: (a: TodayAction) => void }) {
  // 倒计时数字 / 单位拆出来，凑成"33 天"那种紧凑布局
  const { num, unit } = parseHeadline(hero.headline);

  return (
    <div className={s.today}>
      {/* 1. 顶部倒计时横条 ------------------------------------------------- */}
      <div className={s.todayBar}>
        <div className={s.todayCountdown}>
          <span className={s.todayNum}>{num}</span>
          <span className={s.todayUnit}>{unit}</span>
        </div>
        <div className={s.todayMeta}>
          <div className={s.todayMetaKicker}>下一站</div>
          <div className={s.todayMetaMain}>{hero.sub || '回作战台补几天'}</div>
        </div>
      </div>

      {/* 2. 准备进度网格 --------------------------------------------------- */}
      {hero.reminders.length > 0 && (
        <div className={s.todayGrid}>
          {hero.reminders.map((r, i) => (
            <button
              key={i}
              className={`${s.todayCard} ${r.warn ? s.todayCardWarn : ''}`}
              onClick={() => onAction?.(resolveAction(r.action))}
            >
              <div className={s.todayCardHead}>
                <span className={s.todayCardIcon}>{r.icon}</span>
                <span className={s.todayCardKicker}>{r.kicker}</span>
              </div>
              <div className={s.todayCardText}>{r.text}</div>
              <div className={s.todayCardCta}>去看 →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function resolveAction(a: NonNullable<TodayHero['reminders'][number]['action']>): TodayAction {
  if (a.kind === 'tab') return { kind: 'tab', tab: a.tab };
  return { kind: 'day', dayId: a.dayId };
}

/** "还有 33 天" / "已过去 2 天" / "还没排期" → 拆成 (num, unit) 用于排版 */
function parseHeadline(h: string): { num: string; unit: string } {
  if (h === '还没排期') return { num: '—', unit: '排期待补' };
  const m = h.match(/(\d+)/);
  if (!m) return { num: h, unit: '' };
  const n = m[1] ?? '';
  if (h.startsWith('已过去')) return { num: n, unit: '天前' };
  return { num: n, unit: '天后' };
}
