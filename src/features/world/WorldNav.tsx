import { useDraggable } from '@dnd-kit/core';
import { useEffect, useMemo, useState } from 'react';
import type { PoiSummary } from '../../data/types';
import { useWorkbench } from '../../store/workbench';
import { usePois, useWorldIndex } from './queries';
import { formatDuration } from '../../domain/world/duration';
import s from './WorldNav.module.css';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/** 常用的偏好过滤，对应产品方案里"排除宗教场所"这类共同偏好 */
const QUICK_EXCLUDES = ['宗教场所', '观景', '雪山'];

function PoiRow({
  poi,
  onInspect,
  onAdd,
  added,
  cityName,
}: {
  poi: PoiSummary;
  onInspect: (id: string) => void;
  onAdd: (id: string) => void;
  added: boolean;
  cityName?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `world:${poi.id}`,
    data: { kind: 'world-poi', poiId: poi.id },
  });

  const closed = poi.closedWeekdays.map((d) => WEEK[d]).filter(Boolean);

  return (
    <div
      ref={setNodeRef}
      className={`${s.poi} ${added ? s.poiAdded : ''} ${isDragging ? s.poiDragging : ''}`}
      {...listeners}
      {...attributes}
      onClick={() => onInspect(poi.id)}
      role="button"
      tabIndex={0}
    >
      <div className={s.poiMain}>
        <div className={s.poiName}>
          {poi.hasGuide && <span className={s.guideDot} title="有深度导览" />}
          {poi.name}
          {added && <span className={s.addedBadge}>已加</span>}
        </div>
        <div className={s.poiSub}>
          {formatDuration(poi.durationMinutes)}
          {closed.length > 0 && ` · 周${closed.join('')}闭馆`}
          {poi.bookingLeadDays !== null && ` · 提前 ${poi.bookingLeadDays} 天订`}
        </div>
        {cityName && <div className={s.poiCityTag}>{cityName}</div>}
      </div>
      {!added && (
        <button
          className={s.addBtn}
          title="加入当前选中的那天"
          onClick={(e) => {
            e.stopPropagation();
            onAdd(poi.id);
          }}
        >
          +
        </button>
      )}
    </div>
  );
}

export function WorldNav({
  onAddPoi,
  onInspectPoi,
  addedPoiIds,
}: {
  onAddPoi: (poiId: string) => void;
  onInspectPoi: (poiId: string) => void;
  addedPoiIds?: Set<string>;
}) {
  const { data: index } = useWorldIndex();
  const { cityFilter, setCityFilter, keyword, setKeyword, excludeTags, toggleExcludeTag } =
    useWorkbench();

  const { data: pois } = usePois({
    ...(cityFilter ? { cityId: cityFilter } : {}),
    ...(keyword ? { keyword } : {}),
    ...(excludeTags.length ? { excludeTags } : {}),
  });

  const grouped = useMemo(() => {
    if (!index) return [];
    return index.countries.map((c) => ({
      country: c,
      cities: index.cities.filter((city) => city.country === c.id),
    }));
  }, [index]);

  // 国家层：可折叠的层级节点。默认全部展开，城市直接可见，少一层点击才到景点。
  const [openCountries, setOpenCountries] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (index) setOpenCountries(new Set(index.countries.map((c) => c.id)));
  }, [index]);

  // 选中某城市筛选时，自动展开它所属的国家，避免城市藏在折叠里点不到
  useEffect(() => {
    if (!cityFilter || !index) return;
    const city = index.cities.find((c) => c.id === cityFilter);
    if (city && !openCountries.has(city.country)) {
      setOpenCountries((prev) => new Set(prev).add(city.country));
    }
  }, [cityFilter, index, openCountries]);

  const cityNameById = useMemo(
    () => Object.fromEntries((index?.cities ?? []).map((c) => [c.id, c.name])),
    [index],
  );

  const allOpen = index ? openCountries.size === index.countries.length : false;
  const toggleAll = () =>
    setOpenCountries(
      index ? (allOpen ? new Set() : new Set(index.countries.map((c) => c.id))) : new Set(),
    );

  // 已加入行程的点：点「+」改为打开导览卡（避免重复添加），同时卡片显示「已加」角标
  const handleAdd = (id: string) => {
    if (addedPoiIds?.has(id)) onInspectPoi(id);
    else onAddPoi(id);
  };

  const isAdded = (id: string) => addedPoiIds?.has(id) ?? false;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div className={s.title}>
          <span>世界</span>
          <span className={s.count}>{pois?.length ?? 0} 个点</span>
        </div>
        <input
          className={`field ${s.searchField}`}
          placeholder="搜索景点 / 城市"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className={s.filters}>
          <button
            className={`${s.allToggle} ${allOpen ? s.allToggleOn : ''}`}
            onClick={toggleAll}
            title={allOpen ? '收起全部国家' : '展开全部国家'}
          >
            {allOpen ? '收起全部' : '展开全部'}
          </button>
          {QUICK_EXCLUDES.map((t) => (
            <button
              key={t}
              className={`${s.chip} ${excludeTags.includes(t) ? s.chipOn : ''}`}
              onClick={() => toggleExcludeTag(t)}
              title="点击后从列表中排除"
            >
              排除{t}
            </button>
          ))}
          {cityFilter && (
            <button className={`${s.chip} ${s.chipOn}`} onClick={() => setCityFilter(null)}>
              全部城市 ×
            </button>
          )}
        </div>
      </div>

      <div className={`${s.tree} scroll-y`}>
        {/* 搜索时跨城市平铺，并标注每个点所属城市，避免先猜在哪个国家/城市 */}
        {keyword ? (
          <div className={s.poiList}>
            <div className={s.sectionLabel}>搜索结果 · {pois?.length ?? 0}</div>
            {(pois ?? []).map((p) => (
              <PoiRow
                key={p.id}
                poi={p}
                onInspect={onInspectPoi}
                onAdd={handleAdd}
                added={isAdded(p.id)}
                cityName={cityNameById[p.city]}
              />
            ))}
            {(pois ?? []).length === 0 && <div className={s.empty}>没有匹配的景点</div>}
          </div>
        ) : (
          grouped.map(({ country, cities }) => {
            const open = openCountries.has(country.id);
            const poiTotal = cities.reduce((n, c) => n + c.poiCount, 0);
            return (
              <div key={country.id} className={s.countryBlock}>
                <button
                  className={s.countryBtn}
                  onClick={() => toggleCountry(openCountries, setOpenCountries, country.id)}
                  title={open ? '收起城市' : '展开城市'}
                >
                  <span className={`${s.arrow} ${open ? s.arrowOpen : ''}`} aria-hidden />
                  <span className={s.countryNameGroup}>
                    <span className={s.countryName}>{country.name}</span>
                    {country.localName && (
                      <span className={s.countryAlias} title="当地语言名称">
                        {country.localName}
                      </span>
                    )}
                  </span>
                  <span className={s.count}>
                    {cities.length} 城 · {poiTotal}
                  </span>
                </button>
                {open &&
                  cities.map((city) => (
                    <div key={city.id}>
                      <button
                        className={`${s.city} ${cityFilter === city.id ? s.cityOn : ''}`}
                        onClick={() => setCityFilter(cityFilter === city.id ? null : city.id)}
                      >
                        <span>{city.name}</span>
                        <span className={s.count}>{city.poiCount}</span>
                      </button>
                      {cityFilter === city.id && (
                        <div className={s.poiList}>
                          {(pois ?? [])
                            .filter((p) => p.city === city.id)
                            .map((p) => (
                              <PoiRow
                                key={p.id}
                                poi={p}
                                onInspect={onInspectPoi}
                                onAdd={handleAdd}
                                added={isAdded(p.id)}
                              />
                            ))}
                          {(pois ?? []).filter((p) => p.city === city.id).length === 0 && (
                            <div className={s.empty}>当前筛选下没有点位</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function toggleCountry(
  current: Set<string>,
  set: (next: Set<string>) => void,
  id: string,
) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  set(next);
}
