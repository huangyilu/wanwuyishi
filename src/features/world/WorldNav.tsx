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
}: {
  poi: PoiSummary;
  onInspect: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `world:${poi.id}`,
    data: { kind: 'world-poi', poiId: poi.id },
  });

  const closed = poi.closedWeekdays.map((d) => WEEK[d]).filter(Boolean);

  return (
    <div
      ref={setNodeRef}
      className={`${s.poi} ${isDragging ? s.poiDragging : ''}`}
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
        </div>
        <div className={s.poiSub}>
          {formatDuration(poi.durationMinutes)}
          {closed.length > 0 && ` · 周${closed.join('')}闭馆`}
          {poi.bookingLeadDays !== null && ` · 提前 ${poi.bookingLeadDays} 天订`}
        </div>
      </div>
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
    </div>
  );
}

export function WorldNav({
  onAddPoi,
  onInspectPoi,
}: {
  onAddPoi: (poiId: string) => void;
  onInspectPoi: (poiId: string) => void;
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

  // 国家层：可折叠的层级节点，默认收起（形成清晰的国家 ▸ 城市 ▸ POI 三级树）
  const [openCountries, setOpenCountries] = useState<Set<string>>(new Set());

  // 选中某城市筛选时，自动展开它所属的国家，避免城市藏在折叠里点不到
  useEffect(() => {
    if (!cityFilter || !index) return;
    const city = index.cities.find((c) => c.id === cityFilter);
    if (city && !openCountries.has(city.country)) {
      setOpenCountries((prev) => new Set(prev).add(city.country));
    }
  }, [cityFilter, index, openCountries]);

  function toggleCountry(id: string) {
    setOpenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div className={s.title}>
          <span>世界库</span>
          <span className={s.count}>{pois?.length ?? 0} 个点</span>
        </div>
        <input
          className="field"
          placeholder="搜索景点 / 城市"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className={s.filters}>
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
        {grouped.map(({ country, cities }) => {
          const open = openCountries.has(country.id);
          const poiTotal = cities.reduce((n, c) => n + c.poiCount, 0);
          return (
            <div key={country.id}>
              <button
                className={s.countryBtn}
                onClick={() => toggleCountry(country.id)}
                title={open ? '收起城市' : '展开城市'}
              >
                <span className={s.arrow}>{open ? '▾' : '▸'}</span>
                <span className={s.countryName}>
                  {country.name} · {country.localName}
                </span>
                <span className={s.count}>{poiTotal}</span>
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
                            <PoiRow key={p.id} poi={p} onInspect={onInspectPoi} onAdd={onAddPoi} />
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
        })}

        {/* 搜索时跨城市平铺，避免要先猜在哪个城市 */}
        {keyword && (
          <div className={s.poiList}>
            <div className={s.country}>搜索结果</div>
            {(pois ?? []).map((p) => (
              <PoiRow key={p.id} poi={p} onInspect={onInspectPoi} onAdd={onAddPoi} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
