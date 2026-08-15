/**
 * 世界库独立浏览页。
 *
 * 和工作台里的左栏不同：这里不依赖任何行程，纯粹是"知识库"入口——
 * 没开始规划、只想查卢浮宫怎么逛的人，从这里进来就够了。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useViewMode } from '../hooks/useViewMode';
import { PoiGuideCardView } from '../features/world/PoiGuideCard';
import { usePoi, usePois, useWorldIndex } from '../features/world/queries';
import { cityImage } from '../features/world/cityImages';
import { formatDuration } from '../domain/world/duration';
import s from './WorldPage.module.css';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

interface CityInList {
  id: string;
  name: string;
  localName: string;
  country: string;
  poiCount: number;
}

function PoiDetail({ poiId }: { poiId: string }) {
  const { data: poi, isLoading } = usePoi(poiId);
  if (isLoading) return <div className={s.detailEmpty}>加载中…</div>;
  if (!poi) return <div className={s.detailEmpty}>没找到这个点位</div>;
  return <PoiGuideCardView poi={poi} />;
}

function CityHero({ city, className }: { city?: CityInList; className?: string }) {
  if (!city) return null;
  const img = cityImage(city.id);
  if (!img) return null;
  return (
    <div className={`${s.cityHero} ${className || ''}`}>
      <img className={s.cityHeroImg} src={img.src} alt={city.name} />
      <div className={s.cityHeroMask}>
        <span className={s.cityHeroName}>{city.name}</span>
        <span className={s.cityHeroLocal}>{city.localName}</span>
      </div>
      <a
        className={s.cityHeroCredit}
        href={img.page}
        target="_blank"
        rel="noopener noreferrer"
        title={`作者：${img.author} · 许可：${img.license}`}
        onClick={(e) => e.stopPropagation()}
      >
        © {img.author} / {img.license}
      </a>
    </div>
  );
}

export function WorldPage() {
  const [mode] = useViewMode();
  const { poiId: routePoiId } = useParams();
  const nav = useNavigate();
  const { data: index } = useWorldIndex();

  const [cityId, setCityId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<string | null>(routePoiId ?? null);

  const { data: pois } = usePois({
    ...(cityId ? { cityId } : {}),
    ...(keyword ? { keyword } : {}),
    sort: 'popularity',
  });

  const cities: CityInList[] = index?.cities ?? [];
  const countries = index?.countries ?? [];
  const list = pois ?? [];
  const activeCity = cities.find((c) => c.id === cityId);

  // 按国家分组（世界库左侧再分一层）
  const grouped = useMemo(
    () => countries.map((co) => ({ country: co, cities: cities.filter((ci) => ci.country === co.id) })),
    [countries, cities],
  );
  const [openCountries, setOpenCountries] = useState<Set<string>>(new Set());
  const didInitCountries = useRef(false);
  useEffect(() => {
    if (countries.length && !didInitCountries.current) {
      didInitCountries.current = true;
      setOpenCountries(new Set(countries.map((c) => c.id)));
    }
  }, [countries]);
  // 选中某城市时，自动展开其所属国家
  useEffect(() => {
    if (!cityId) return;
    const c = cities.find((ci) => ci.id === cityId);
    if (c && !openCountries.has(c.country)) {
      setOpenCountries((prev) => new Set(prev).add(c.country));
    }
  }, [cityId, cities, openCountries]);
  function toggleCountry(id: string) {
    setOpenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 单个城市卡片（带图 / 无图两种形态），供国家分组内复用
  function renderCityCard(c: CityInList) {
    const img = cityImage(c.id);
    const on = cityId === c.id;
    if (!img) {
      return (
        <button
          key={c.id}
          className={`${s.cityBtn} ${on ? s.cityOn : ''}`}
          onClick={() => setCityId(c.id)}
          title={c.localName}
        >
          <div className={s.cityRow}>
            <span>{c.name}</span>
            <span className={s.count}>{c.poiCount}</span>
          </div>
        </button>
      );
    }
    return (
      <div
        key={c.id}
        className={`${s.cityCard} ${on ? s.cityCardOn : ''}`}
        title={`${c.localName} · 图：${img.author} (${img.license})`}
      >
        <button className={s.cityCardBtn} onClick={() => setCityId(c.id)}>
          <div className={s.cityThumbWrap}>
            <img className={s.cityThumb} src={img.src} alt={c.name} loading="lazy" />
          </div>
          <div className={s.cityRow}>
            <span className={s.cityName}>{c.name}</span>
            <span className={s.count}>{c.poiCount}</span>
          </div>
        </button>
        <a
          className={s.cityCredit}
          href={img.page}
          target="_blank"
          rel="noopener noreferrer"
          title={`作者：${img.author} · 许可：${img.license}`}
        >
          © {img.author} / {img.license}
        </a>
      </div>
    );
  }

  /* ------------------------------ 移动端 ------------------------------ */
  if (mode === 'mobile') {
    if (selected) {
      return (
        <div className={s.mobile}>
          <div className={s.mHead}>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>
              ← 返回
            </button>
          </div>
          <PoiDetail poiId={selected} />
        </div>
      );
    }
    return (
      <div className={s.mobile}>
        <div className={s.mHead}>
          <input
            className="field"
            placeholder="搜索景点"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        {activeCity && <CityHero city={activeCity} className={s.mHero} />}
        <div className={s.mChips}>
          <button
            className={`${s.mChip} ${cityId === null ? s.mChipOn : ''}`}
            onClick={() => setCityId(null)}
          >
            全部
          </button>
          {cities.map((c) => (
            <button
              key={c.id}
              className={`${s.mChip} ${cityId === c.id ? s.mChipOn : ''}`}
              onClick={() => setCityId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className={s.mList}>
          {list.map((p) => (
            <button key={p.id} className={s.mRow} onClick={() => setSelected(p.id)}>
              <div className={s.cardName}>
                {p.hasGuide && <span className={s.guideDot} />}
                {p.name}
              </div>
              <div className={s.cardMeta}>
                {formatDuration(p.durationMinutes)}
                {p.closedWeekdays.length > 0 &&
                  ` · 周${p.closedWeekdays.map((d) => WEEK[d]).join('')}闭馆`}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* -------------------------------- PC -------------------------------- */
  return (
    <div className={`${s.page} ${selected ? s.withDetail : ''}`}>
      <aside className={`${s.side} scroll-y`}>
        <div className={s.sideTitle}>城市</div>
        <button
          className={`${s.cityBtn} ${cityId === null ? s.cityOn : ''}`}
          onClick={() => setCityId(null)}
        >
          <span>全部</span>
          <span className={s.count}>{index?.pois.length ?? 0}</span>
        </button>
        {grouped.map(({ country, cities: cits }) => {
          const open = openCountries.has(country.id);
          const poiTotal = cits.reduce((n, c) => n + c.poiCount, 0);
          return (
            <div key={country.id}>
              <button className={s.countryBtn} onClick={() => toggleCountry(country.id)}>
                <span className={s.arrow}>{open ? '▾' : '▸'}</span>
                <span className={s.countryNameGroup}>
                  <span className={s.countryName}>{country.name}</span>
                  {country.localName && (
                    <span className={s.countryAlias} title="当地语言名称">
                      {country.localName}
                    </span>
                  )}
                </span>
                <span className={s.count}>
                  {cits.length} 城 · {poiTotal}
                </span>
              </button>
              {open && cits.map((c) => renderCityCard(c))}
            </div>
          );
        })}
      </aside>

      {selected ? (
        <nav className={`${s.rail} scroll-y`} aria-label="景点列表">
          {activeCity && <CityHero city={activeCity} className={s.railHero} />}
          <div className={s.railHead}>
            <span>
              {cityId ? (activeCity?.name ?? '景点') : '全部景点'}
            </span>
            <span className={s.count}>{list.length}</span>
          </div>
          {list.map((p) => (
            <button
              key={p.id}
              className={`${s.railItem} ${selected === p.id ? s.railOn : ''}`}
              onClick={() => {
                setSelected(p.id);
                if (routePoiId) nav(`/world/poi/${p.id}`, { replace: true });
              }}
            >
              <span className={s.railName}>
                {p.hasGuide && <span className={s.guideDot} title="有深度导览" />}
                {p.name}
              </span>
              <span className={s.railMeta}>
                {formatDuration(p.durationMinutes)}
                {p.closedWeekdays.length > 0 &&
                  ` · 周${p.closedWeekdays.map((d) => WEEK[d]).join('')}闭馆`}
              </span>
            </button>
          ))}
        </nav>
      ) : (
        <main className={`${s.main} scroll-y`}>
          {activeCity && <CityHero city={activeCity} />}
          <input
            className={`field ${s.search}`}
            placeholder="搜索景点 / 城市"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className={s.grid}>
            {list.map((p) => (
              <button
                key={p.id}
                className={`${s.card} ${selected === p.id ? s.cardOn : ''}`}
                onClick={() => {
                  setSelected(p.id);
                  if (routePoiId) nav(`/world/poi/${p.id}`, { replace: true });
                }}
              >
                <div className={s.cardName}>
                  {p.hasGuide && <span className={s.guideDot} title="有深度导览" />}
                  {p.name}
                </div>
                <div className={s.cardLocal}>{p.localName}</div>
                <div className={s.cardMeta}>
                  {formatDuration(p.durationMinutes)}
                  {p.closedWeekdays.length > 0 &&
                    ` · 周${p.closedWeekdays.map((d) => WEEK[d]).join('')}闭馆`}
                  {p.bookingLeadDays !== null && ` · 提前 ${p.bookingLeadDays} 天订`}
                </div>
                <div className={s.cardTags}>
                  {p.tags.slice(0, 3).map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </main>
      )}

      <section className={`${s.detail} scroll-y`}>
        {selected ? (
          <div className={s.detailInner}>
            <PoiDetail poiId={selected} />
          </div>
        ) : (
          <div className={s.detailEmpty}>
            点一个景点，这里出深度导览：
            <br />
            入口怎么进、必看在哪个展厅、几点人最少、票价与开放时间的官方来源和核实日期。
            <br />
            <br />
            带橙点的表示已配好深导览。
          </div>
        )}
      </section>
    </div>
  );
}
