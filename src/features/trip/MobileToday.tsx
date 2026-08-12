/**
 * 移动端「今天」tab 的空档视图。
 *
 * 当行程里没有任何一天等于今天时，不再干巴巴地落在第一天，而是给一个
 * 「出发倒计时」+「出发前准备提醒」：还有几天、最近排到哪天哪城，以及
 * 待订票 / 打包未完成 / 需办签证 / 目的地货币 等可 actionable 的提醒。
 * 若今天正好命中某天，本组件返回 null，由 MobileTrip 正常渲染当天。
 *
 * 推导逻辑在 domain/trip/today-hero.ts 的纯函数 computeTodayHero 里（含单测）。
 */
import { todayStr } from '../../domain/date';
import { computeTodayHero } from '../../domain/trip/today-hero';
import type { Poi } from '../../domain/world/schema';
import type { CitySummary, CountrySummary, TripBundle } from '../../data/types';
import s from './MobileTrip.module.css';

export function MobileToday({
  bundle,
  poiMap,
  cities,
  countries,
}: {
  bundle: TripBundle;
  poiMap: Record<string, Poi> | undefined;
  cities: CitySummary[];
  countries: CountrySummary[];
}) {
  const hero = computeTodayHero({ today: todayStr(), bundle, poiMap, cities, countries });
  if (hero.matched) return null;

  return (
    <div className={s.todayHero}>
      <div className={s.todayHeroTop}>
        <div className={s.todayHeroLabel}>出发倒计时</div>
        <div className={s.todayHeroBig}>{hero.headline}</div>
        <div className={s.todayHeroSub}>{hero.sub}</div>
      </div>

      {hero.reminders.length > 0 && (
        <div className={s.prepList}>
          <div className={s.prepTitle}>出发前准备</div>
          {hero.reminders.map((r, i) => (
            <div key={i} className={`${s.prepItem} ${r.warn ? s.prepWarn : ''}`}>
              <span className={s.prepIcon}>{r.icon}</span>
              <span className={s.prepText}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
