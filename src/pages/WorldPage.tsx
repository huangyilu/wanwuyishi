/**
 * 世界库独立浏览页。
 *
 * 和工作台里的左栏不同：这里不依赖任何行程，纯粹是"知识库"入口——
 * 没开始规划、只想查卢浮宫怎么逛的人，从这里进来就够了。
 *
 * 移动端：多层级探索（大洲 → 国家 → 城市 → 景点详情）
 * PC 端：三栏（城市侧栏 + 景点网格 + 详情）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useViewMode } from '../hooks/useViewMode';
import { PoiGuideCardView } from '../features/world/PoiGuideCard';
import { usePoi, usePois, useWorldIndex } from '../features/world/queries';
import { cityImage } from '../features/world/cityImages';
import { formatDuration } from '../domain/world/duration';
import type { PoiSummary } from '../data/types';
import s from './WorldPage.module.css';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/** POI 类型 → 中文标签 + emoji */
const POI_TYPE_META: Record<string, { label: string; icon: string }> = {
  museum: { label: '博物馆', icon: '🏛️' },
  landmark: { label: '地标', icon: '🏰' },
  park: { label: '公园', icon: '🌳' },
  viewpoint: { label: '观景台', icon: '🏔️' },
  church: { label: '教堂', icon: '⛪' },
  market: { label: '市场', icon: '🛒' },
  restaurant: { label: '餐厅', icon: '🍽️' },
  station: { label: '车站', icon: '🚉' },
  facility: { label: '设施', icon: '📍' },
  other: { label: '其他', icon: '📍' },
};

const POI_TYPE_FALLBACK = { label: '其他', icon: '📍' };

/** 国家 → 大洲映射 */
const CONTINENT_MAP: Record<string, string> = {
  fr: '欧洲',
  it: '欧洲',
  ch: '欧洲',
  eg: '非洲',
};

/** 国旗 emoji */
const FLAG_MAP: Record<string, string> = {
  fr: '🇫🇷',
  it: '🇮🇹',
  ch: '🇨🇭',
  eg: '🇪🇬',
};

interface CityInList {
  id: string;
  name: string;
  localName: string;
  country: string;
  poiCount: number;
  location: { lat: number; lng: number };
  hasSurvival: boolean;
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

/** POI 类型徽章 */
function TypeBadge({ type }: { type: string }) {
  const meta = POI_TYPE_META[type] ?? POI_TYPE_META.other ?? POI_TYPE_FALLBACK;
  return <span className={s.typeBadge}>{meta.icon} {meta.label}</span>;
}

/** 移动端景点卡片 */
function MobilePoiCard({ poi, onClick }: { poi: PoiSummary; onClick: () => void }) {
  const meta = POI_TYPE_META[poi.type] ?? POI_TYPE_META.other ?? POI_TYPE_FALLBACK;
  return (
    <button className={s.mPoiCard} onClick={onClick}>
      <div className={s.mPoiIcon}>{meta.icon}</div>
      <div className={s.mPoiBody}>
        <div className={s.mPoiName}>
          {poi.hasGuide && <span className={s.guideDot} />}
          {poi.name}
        </div>
        <div className={s.mPoiLocal}>{poi.localName}</div>
        <div className={s.mPoiMeta}>
          {meta.label}
          {' · '}
          {formatDuration(poi.durationMinutes)}
          {poi.closedWeekdays.length > 0 &&
            ` · 周${poi.closedWeekdays.map((d) => WEEK[d]).join('')}闭馆`}
        </div>
        {poi.tags.length > 0 && (
          <div className={s.mPoiTags}>
            {poi.tags.slice(0, 3).map((t) => (
              <span key={t} className={s.mPoiTag}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </button>
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

  const cities: CityInList[] = (index?.cities ?? []).map((c) => ({ ...c })) as CityInList[];
  const countries = index?.countries ?? [];
  const list = pois ?? [];
  const activeCity = cities.find((c) => c.id === cityId);

  // 按大洲 → 国家分组
  const continentGroups = useMemo(() => {
    const continentMap = new Map<string, typeof countries>();
    for (const co of countries) {
      const continent = CONTINENT_MAP[co.id] || '其他';
      if (!continentMap.has(continent)) continentMap.set(continent, []);
      continentMap.get(continent)!.push(co);
    }
    return Array.from(continentMap.entries()).map(([continent, ctrs]) => ({
      continent,
      countries: ctrs.map((co) => ({
        country: co,
        cities: cities.filter((ci) => ci.country === co.id),
      })),
    }));
  }, [countries, cities]);

  // PC 端按国家分组（侧栏用）
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

  /* ============================== 移动端 ============================== */

  if (mode === 'mobile') {
    // Level 2: POI 详情
    if (selected) {
      return (
        <div className={s.mobile}>
          <div className={s.mHead}>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>
              ← 返回
            </button>
          </div>
          <div className={s.detailMobile}>
            <PoiDetail poiId={selected} />
          </div>
        </div>
      );
    }

    // Level 1: 城市景点列表
    if (cityId && activeCity) {
      return (
        <div className={s.mobile}>
          <div className={s.mHead}>
            <button className="btn btn-sm btn-ghost" onClick={() => setCityId(null)}>
              ← 探索
            </button>
            <span className={s.mHeadTitle}>{activeCity.name}</span>
          </div>
          <div className={s.detailMobile}>
            <CityHero city={activeCity} className={s.mCityHero} />
            <div className={s.mCityInfo}>
              <span className={s.mCityLocal}>{activeCity.localName}</span>
              <span className={s.mCityCountry}>
                {FLAG_MAP[activeCity.country] || ''} {countries.find((c) => c.id === activeCity.country)?.name || ''}
              </span>
              <span className={s.mCityCount}>{activeCity.poiCount} 个景点</span>
            </div>
            <div className={s.mPoiList}>
              {list.length === 0 && (
                <div className={s.mEmpty}>没有匹配的景点</div>
              )}
              {list.map((p) => (
                <MobilePoiCard
                  key={p.id}
                  poi={p}
                  onClick={() => setSelected(p.id)}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Level 0: 探索世界首页
    const searchResults = keyword ? list : null;
    return (
      <div className={s.mobile}>
        <div className={s.mHead}>
          <input
            className="field"
            placeholder="🔍 搜索景点 / 城市"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className={s.detailMobile}>
          {searchResults ? (
            // 搜索结果
            <div className={s.mPoiList}>
              <div className={s.mSearchHint}>
                找到 {searchResults.length} 个结果
              </div>
              {searchResults.length === 0 && <div className={s.mEmpty}>没有匹配的景点</div>}
              {searchResults.map((p) => {
                const city = cities.find((c) => c.id === p.city);
                return (
                  <button
                    key={p.id}
                    className={s.mSearchRow}
                    onClick={() => setSelected(p.id)}
                  >
                    <div className={s.mPoiName}>
                      {p.hasGuide && <span className={s.guideDot} />}
                      {p.name}
                    </div>
                    <div className={s.mPoiMeta}>
                      {city?.name} · {formatDuration(p.durationMinutes)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            // 探索首页
            <>
              <div className={s.mExploreHero}>
                <div className={s.mExploreTitle}>探索世界</div>
                <div className={s.mExploreSub}>
                  {countries.length} 个国家 · {cities.length} 个城市 · {index?.pois.length ?? 0} 个景点
                </div>
              </div>
              {continentGroups.map(({ continent, countries: ctrs }) => (
                <div key={continent} className={s.mContinent}>
                  <div className={s.mContinentLabel}>{continent}</div>
                  {ctrs.map(({ country, cities: cits }) => {
                    const poiTotal = cits.reduce((n, c) => n + c.poiCount, 0);
                    return (
                      <div key={country.id} className={s.mCountrySection}>
                        <div className={s.mCountryHead}>
                          <span className={s.mCountryFlag}>{FLAG_MAP[country.id] || '🌍'}</span>
                          <span className={s.mCountryName}>{country.name}</span>
                          <span className={s.mCountryLocal}>{country.localName}</span>
                          <span className={s.mCountryMeta}>
                            {cits.length} 城 · {poiTotal} 景点
                          </span>
                        </div>
                        <div className={s.mCityScroll}>
                          {cits.map((c) => {
                            const img = cityImage(c.id);
                            if (img) {
                              return (
                                <button
                                  key={c.id}
                                  className={s.mCityCard}
                                  onClick={() => setCityId(c.id)}
                                >
                                  <div className={s.mCityCardImgWrap}>
                                    <img className={s.mCityCardImg} src={img.src} alt={c.name} loading="lazy" />
                                  </div>
                                  <div className={s.mCityCardName}>{c.name}</div>
                                  <div className={s.mCityCardLocal}>{c.localName}</div>
                                  <div className={s.mCityCardCount}>{c.poiCount} 景点</div>
                                </button>
                              );
                            }
                            return (
                              <button
                                key={c.id}
                                className={s.mCityCardPlain}
                                onClick={() => setCityId(c.id)}
                              >
                                <div className={s.mCityCardName}>{c.name}</div>
                                <div className={s.mCityCardLocal}>{c.localName}</div>
                                <div className={s.mCityCardCount}>{c.poiCount} 景点</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  /* ================================ PC ================================ */

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
          {cityId === null && !keyword ? (
            // 探索首页：按大洲 → 国家 → 城市分区展示
            <div className={s.discover}>
              {continentGroups.map(({ continent, countries: ctrs }) => (
                <div key={continent} className={s.discoverContinent}>
                  <div className={s.discoverContinentLabel}>{continent}</div>
                  {ctrs.map(({ country, cities: cits }) => {
                    const poiTotal = cits.reduce((n, c) => n + c.poiCount, 0);
                    return (
                      <div key={country.id} className={s.discoverCountry}>
                        <div className={s.discoverCountryHead}>
                          <span className={s.mCountryFlag}>{FLAG_MAP[country.id] || '🌍'}</span>
                          <span className={s.discoverCountryName}>{country.name}</span>
                          <span className={s.discoverCountryLocal}>{country.localName}</span>
                          <span className={s.discoverCountryMeta}>
                            {cits.length} 城 · {poiTotal} 景点
                          </span>
                        </div>
                        <div className={s.discoverCityGrid}>
                          {cits.map((c) => {
                            const img = cityImage(c.id);
                            if (img) {
                              return (
                                <button
                                  key={c.id}
                                  className={s.discoverCityCard}
                                  onClick={() => setCityId(c.id)}
                                >
                                  <div className={s.discoverCityImgWrap}>
                                    <img src={img.src} alt={c.name} loading="lazy" />
                                  </div>
                                  <div className={s.discoverCityInfo}>
                                    <div className={s.discoverCityName}>{c.name}</div>
                                    <div className={s.discoverCityLocal}>{c.localName}</div>
                                    <div className={s.discoverCityCount}>{c.poiCount} 景点</div>
                                  </div>
                                </button>
                              );
                            }
                            return (
                              <button
                                key={c.id}
                                className={s.discoverCityPlain}
                                onClick={() => setCityId(c.id)}
                              >
                                <div className={s.discoverCityName}>{c.name}</div>
                                <div className={s.discoverCityLocal}>{c.localName}</div>
                                <div className={s.discoverCityCount}>{c.poiCount} 景点</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className={s.grid}>
              {list.map((p) => {
                return (
                  <button
                    key={p.id}
                    className={`${s.card} ${selected === p.id ? s.cardOn : ''}`}
                    onClick={() => {
                      setSelected(p.id);
                      if (routePoiId) nav(`/world/poi/${p.id}`, { replace: true });
                    }}
                  >
                    <div className={s.cardTypeRow}>
                      <TypeBadge type={p.type} />
                      {p.hasGuide && <span className={s.cardGuideTag}>深导览</span>}
                    </div>
                    <div className={s.cardName}>{p.name}</div>
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
                );
              })}
            </div>
          )}
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
