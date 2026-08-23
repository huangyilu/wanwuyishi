/**
 * 行程地图模式（参考 TripProf 的「整程一张图」）。
 *
 * 渲染引擎：MapLibre GL JS（开源、免费、无需 key，契合 0 成本硬约束）。
 * 底图策略（自托管矢量优先，位图兜底）：
 *   - 若 `public/tiles.pmtiles` 存在 → 用 PMTiles 矢量瓦片（丝滑缩放 / 3D 建筑 / 精致标注，
 *     底层 schema 同时兼容 Protomaps 与 OpenMapTiles，丢哪个源都能出底图）。瓦片放自己
 *     GitHub Pages，大陆可达、零成本、无 key。
 *   - 否则 → 高德位图兜底（国内可达），保证开发期 / 未放矢量文件时地图不至于空白。
 *
 * 叠加层（矢量 OR 位图之上通用）：
 *   - 城市节点（HTML Marker）+ 城际动线（优先交通段 from→to，退而求其次按天城市顺序）
 *   - POI 圆点按所在天着色，候选池灰显；点圆点弹详情卡（配图 / 开放时间 / 无障碍）+ 选某天加入或移动
 *   - 右栏/时间线选中某一天 → 地图 flyToBounds 飞抵该天范围（双向联动）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './mapMarkers.css';
import type { CitySummary, TripBundle } from '../../data/types';
import type { Poi } from '../../domain/world/schema';
import { formatCn } from '../../domain/date';
import { byRank, rankForInsert } from '../../domain/trip/rank';
import { poiImage } from '../world/poiImages';
import { ClickableImage } from '../../components/ClickableImage';
import { useWorkbench } from '../../store/workbench';
import type { useTripMutations } from './queries';
import s from './MapPanel.module.css';

type Mutations = ReturnType<typeof useTripMutations>;

/* 注册 pmtiles 协议（模块级仅一次） */
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile as unknown as maplibregl.AddProtocolAction);

const DAY_COLORS = [
  '#b9852a', '#2f9462', '#378add', '#d4537e', '#639922',
  '#ba7517', '#7f77dd', '#1d9e75', '#d85a30', '#3c3489',
];

/** 矢量样式：同时兼容 Protomaps 与 OpenMapTiles 两套 schema（不匹配的层只告警、不绘制）。 */
function vectorStyle(pmUrl: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { pm: { type: 'vector', url: pmUrl } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#ECE4D2' } },
      // 陆地：earth(Protomaps) / landcover(OpenMapTiles)
      { id: 'land', type: 'fill', source: 'pm', 'source-layer': 'earth', paint: { 'fill-color': '#e4ebe1' } },
      { id: 'land2', type: 'fill', source: 'pm', 'source-layer': 'landcover', paint: { 'fill-color': '#e4ebe1' } },
      { id: 'water', type: 'fill', source: 'pm', 'source-layer': 'water', paint: { 'fill-color': '#cfe0e8' } },
      { id: 'buildings', type: 'fill', source: 'pm', 'source-layer': 'buildings', paint: { 'fill-color': '#d6dcd1', 'fill-opacity': 0.7 } },
      { id: 'building2', type: 'fill', source: 'pm', 'source-layer': 'building', paint: { 'fill-color': '#d6dcd1', 'fill-opacity': 0.7 } },
      { id: 'roads', type: 'line', source: 'pm', 'source-layer': 'roads', paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.9 } },
      { id: 'transportation', type: 'line', source: 'pm', 'source-layer': 'transportation', paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.9 } },
    ],
  };
}

/** 位图兜底样式：高德路网（国内可达；海外直出 WGS-84，与本项目坐标一致免换算）。 */
function rasterStyle(): maplibregl.StyleSpecification {
  const amap = (n: string) =>
    `https://webrd0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`;
  return {
    version: 8,
    sources: {
      amap: {
        type: 'raster',
        tiles: [amap('1'), amap('2'), amap('3'), amap('4')],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© 高德地图 AutoNavi',
      },
    },
    layers: [{ id: 'amap', type: 'raster', source: 'amap' }],
  };
}

/** 探测本地是否放好了矢量瓦片文件（HEAD，超时即视为无 → 走位图兜底）。 */
async function hasPmTiles(): Promise<boolean> {
  try {
    const url = new URL('tiles.pmtiles', document.baseURI).href;
    const ctrl = new AbortController();
    const to = window.setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    window.clearTimeout(to);
    return r.ok;
  } catch {
    return false;
  }
}

export function MapPanel({
  bundle,
  poiMap,
  cities,
  mut,
}: {
  bundle: TripBundle;
  poiMap: Record<string, Poi>;
  cities: CitySummary[];
  mut: Mutations;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const cityMarkersRef = useRef<maplibregl.Marker[]>([]);

  const cityIndex = useMemo(() => {
    const m: Record<string, CitySummary> = {};
    for (const c of cities) m[c.id] = c;
    return m;
  }, [cities]);

  const days = useMemo(
    () => [...bundle.days].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [bundle.days],
  );

  const { selectedDate } = useWorkbench();
  const [selected, setSelected] = useState<{ poiId: string; dayId: string | null } | null>(null);

  const dayColor = useMemo(() => {
    const m = new Map<string, string>();
    days.forEach((d, i) => m.set(d.id, DAY_COLORS[i % DAY_COLORS.length] ?? '#a19c90'));
    return m;
  }, [days]);

  /* 初始化地图（仅挂载时一次） */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      const useVector = await hasPmTiles();
      if (disposed || !containerRef.current) return;
      const pmUrl = 'pmtiles://' + new URL('tiles.pmtiles', document.baseURI).href;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: useVector ? vectorStyle(pmUrl) : rasterStyle(),
        center: [8.5, 46.5],
        zoom: 5,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.on('load', () => {
        loadedRef.current = true;
        drawAll();
        if (!selectedDate) fitAll();
      });

      // 容器刚从 display 切换可见 / 布局未稳时，强制让 MapLibre 重算尺寸
      const raf = window.requestAnimationFrame(() => map.resize());
      const t = window.setTimeout(() => map.resize(), 200);
      cleanups.push(() => {
        window.cancelAnimationFrame(raf);
        window.clearTimeout(t);
      });
    })();

    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
      cityMarkersRef.current.forEach((m) => m.remove());
      cityMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  /* 数据变化 → 重绘叠加层 + 处理选中天飞抵 */
  useEffect(() => {
    if (!mapRef.current || !loadedRef.current) return;
    drawAll();
    if (selectedDate) flyToDay(selectedDate);
    else fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, poiMap, cityIndex, days, dayColor, selectedDate]);

  function poiFeatureCollection(): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const it of bundle.items) {
      if (!it.poiId) continue;
      const poi = poiMap[it.poiId];
      if (!poi?.location) continue;
      const scheduled = Boolean(it.dayId);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [poi.location.lng, poi.location.lat] },
        properties: {
          poiId: it.poiId,
          dayId: it.dayId ?? '',
          color: scheduled ? dayColor.get(it.dayId as string) ?? '#a19c90' : '#a19c90',
          scheduled,
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  function routeFeatureCollection(): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    const drawn = new Set<string>();
    // 1) 城际动线：交通段 from→to（去重）
    for (const it of bundle.items) {
      if ((it.kind ?? 'poi') !== 'transport') continue;
      const from = it.fromCityId ? cityIndex[it.fromCityId] : undefined;
      const to = it.toCityId ? cityIndex[it.toCityId] : undefined;
      if (!from?.location || !to?.location) continue;
      const key = `${from.id}->${to.id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[from.location.lng, from.location.lat], [to.location.lng, to.location.lat]] },
        properties: { kind: 'transport' },
      });
    }
    // 2) 天的城市顺序连线（整体路线感）
    const routePts: [number, number][] = [];
    for (const d of days) {
      const c = d.cityId ? cityIndex[d.cityId] : undefined;
      if (c?.location) routePts.push([c.location.lng, c.location.lat]);
    }
    if (routePts.length > 1) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: routePts }, properties: { kind: 'order' } });
    }
    return { type: 'FeatureCollection', features };
  }

  function drawAll() {
    const map = mapRef.current;
    if (!map) return;

    // POI 圆点
    const poiFC = poiFeatureCollection();
    const pois = map.getSource('pois') as maplibregl.GeoJSONSource | undefined;
    if (pois) {
      pois.setData(poiFC as GeoJSON.FeatureCollection);
    } else {
      map.addSource('pois', { type: 'geojson', data: poiFC });
      map.addLayer({
        id: 'poi-layer',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'scheduled'], false], 7, 5],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': ['case', ['boolean', ['get', 'scheduled'], false], 0.95, 0.5],
        },
      });
      map.on('click', 'poi-layer', (e) => {
        const f = e.features?.[0];
        if (f?.properties) setSelected({ poiId: String(f.properties.poiId), dayId: f.properties.dayId ? String(f.properties.dayId) : null });
      });
      map.on('mouseenter', 'poi-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'poi-layer', () => { map.getCanvas().style.cursor = ''; });
    }

    // 动线 / 城市顺序线
    const routeFC = routeFeatureCollection();
    const routes = map.getSource('routes') as maplibregl.GeoJSONSource | undefined;
    if (routes) {
      routes.setData(routeFC as GeoJSON.FeatureCollection);
    } else {
      map.addSource('routes', { type: 'geojson', data: routeFC });
      map.addLayer({
        id: 'route-order',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'order'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#376B6D', 'line-width': 2, 'line-opacity': 0.45 },
      });
      map.addLayer({
        id: 'route-transport',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'transport'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#305A56', 'line-width': 3, 'line-dasharray': [6, 7], 'line-opacity': 0.85 },
      });
    }

    // 城市节点（HTML Marker）
    cityMarkersRef.current.forEach((m) => m.remove());
    cityMarkersRef.current = [];
    const seen = new Set<string>();
    for (const d of days) {
      if (!d.cityId) continue;
      const c = cityIndex[d.cityId];
      if (!c?.location || seen.has(c.id)) continue;
      seen.add(c.id);
      const el = document.createElement('div');
      el.className = 'ww-city';
      el.innerHTML = `<span class="ww-city-pin">${c.name}</span>`;
      cityMarkersRef.current.push(
        new maplibregl.Marker({ element: el }).setLngLat([c.location.lng, c.location.lat]).addTo(map),
      );
    }
  }

  function boundsOf(pts: [number, number][]): maplibregl.LngLatBounds | null {
    if (pts.length === 0) return null;
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend(p));
    return b;
  }

  function fitAll() {
    const map = mapRef.current;
    if (!map) return;
    const pts: [number, number][] = [];
    for (const it of bundle.items) {
      const poi = it.poiId ? poiMap[it.poiId] : undefined;
      if (poi?.location) pts.push([poi.location.lng, poi.location.lat]);
    }
    for (const d of days) {
      const c = d.cityId ? cityIndex[d.cityId] : undefined;
      if (c?.location) pts.push([c.location.lng, c.location.lat]);
    }
    const b = boundsOf(pts);
    if (b) map.fitBounds(b, { padding: 40, maxZoom: 12, duration: 0 });
  }

  function flyToDay(date: string) {
    const map = mapRef.current;
    if (!map) return;
    const day = bundle.days.find((d) => d.date === date);
    if (!day) return;
    const pts: [number, number][] = [];
    const c = day.cityId ? cityIndex[day.cityId] : undefined;
    if (c?.location) pts.push([c.location.lng, c.location.lat]);
    for (const it of bundle.items) {
      if (it.dayId !== day.id || !it.poiId) continue;
      const poi = poiMap[it.poiId];
      if (poi?.location) pts.push([poi.location.lng, poi.location.lat]);
    }
    const b = boundsOf(pts);
    if (b) map.fitBounds(b, { padding: 55, maxZoom: 13, duration: 800 });
  }

  const selPoi = selected?.poiId ? poiMap[selected.poiId] : undefined;
  const img = selected?.poiId ? poiImage(selected.poiId) : undefined;

  function commitToDay(dayId: string | null) {
    if (!selected?.poiId) return;
    const existing = bundle.items.find((i) => i.poiId === selected.poiId);
    if (existing) {
      const target = (
        dayId
          ? bundle.items.filter((i) => i.dayId === dayId)
          : bundle.items.filter((i) => i.dayId === null)
      ).sort(byRank);
      const rank = rankForInsert(target, target.length);
      mut.moveItem.mutate({ id: existing.id, dayId, rank });
    } else {
      mut.addItem.mutate({
        dayId,
        poiId: selected.poiId,
        status: dayId ? 'candidate' : 'wishlist',
      });
    }
    setSelected(null);
  }

  const hasContent = days.some((d) => d.cityId) || bundle.items.some((i) => i.poiId);

  return (
    <div className={s.root}>
      <div ref={containerRef} className={s.canvas} />

      {!hasContent && (
        <div className={s.empty}>还没有点或城市，先切到「时间线」把景点拖进来、给每天选好城市。</div>
      )}

      {/* 图例 */}
      {days.length > 0 && (
        <div className={s.legend}>
          {days.map((d, i) => (
            <span key={d.id} className={s.legendItem}>
              <i className={s.legendDot} style={{ background: DAY_COLORS[i % DAY_COLORS.length] ?? '#a19c90' }} />
              D{i + 1}
            </span>
          ))}
          <span className={s.legendItem}>
            <i className={s.legendDot} style={{ background: '#a19c90' }} />
            候选池
          </span>
        </div>
      )}

      {/* POI 详情卡（点圆点弹出） */}
      {selected && selPoi && (
        <div className={s.card}>
          <button className={s.cardClose} onClick={() => setSelected(null)} title="关闭">
            ×
          </button>
          {img?.src && (
            <ClickableImage
              className={s.cardImg}
              src={img.src}
              alt={selPoi.name}
              caption={selPoi.name}
              credit={img.author}
              license={img.license}
              page={img.page}
            />
          )}
          <div className={s.cardBody}>
            <div className={s.cardName}>{selPoi.name}</div>
            <div className={s.cardMeta}>
              {cityIndex[selPoi.city]?.name}
              {selPoi.localName ? ` · ${selPoi.localName}` : ''}
            </div>
            <div className={s.cardRow}>
              <span>开放</span>
              {selPoi.volatile.hours?.value ?? '时间未核实'}
            </div>
            <div className={s.cardRow}>
              <span>无障碍</span>
              {selPoi.facilities?.accessible ? '♿ 友好' : selPoi.facilities ? '未标注' : '—'}
            </div>
            <div className={s.cardAct}>
              <select
                className={s.cardSelect}
                value={selected.dayId ?? ''}
                onChange={(e) => setSelected({ poiId: selected.poiId, dayId: e.target.value || null })}
              >
                <option value="">候选池</option>
                {days.map((d, i) => (
                  <option key={d.id} value={d.id}>
                    D{i + 1} · {formatCn(d.date)}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => commitToDay(selected.dayId ?? null)}>
                {selected.dayId ? '移动到这天' : '加入行程'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
