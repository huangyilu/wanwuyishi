/**
 * 移动端行程视图 —— 在路上用的那一半。
 *
 * 手机上不做规划，只做"现在该干嘛"：默认落在今天（不在行程内则落第一天），
 * 一屏就是当天的顺序、闭馆提醒和每个点的深导览入口。
 */
import { useMemo, useState } from 'react';
import { formatCn, todayStr, weekdayLabel } from '../../domain/date';
import { isClosedOn } from '../../domain/trip/closure-check';
import { byRank } from '../../domain/trip/rank';
import { formatDuration } from '../../domain/world/duration';
import type { ItemStatus, TransportMode } from '../../data/types';
import { PoiGuideCard } from '../world/PoiGuideCard';
import { usePoiMap, useWorldIndex } from '../world/queries';
import { useTripBundle } from './queries';
import s from './MobileTrip.module.css';

const STATUS_COLOR: Record<ItemStatus, string> = {
  wishlist: 'var(--st-wishlist)',
  candidate: 'var(--st-candidate)',
  confirmed: 'var(--st-confirmed)',
  visited: 'var(--st-visited)',
  dropped: 'var(--st-dropped)',
};

const TRANSPORT_ICON: Record<TransportMode, string> = {
  train: '🚄',
  flight: '✈️',
  bus: '🚌',
  ferry: '⛴️',
  car: '🚗',
  walk: '🚶',
  other: '🔁',
};

export function MobileTrip({ tripId }: { tripId: string }) {
  const { data: bundle, isLoading } = useTripBundle(tripId);
  const poiIds = useMemo(
    () =>
      Array.from(
        new Set((bundle?.items ?? []).map((i) => i.poiId).filter((x): x is string => Boolean(x))),
      ),
    [bundle?.items],
  );
  const { data: poiMap } = usePoiMap(poiIds);
  const { data: index } = useWorldIndex();
  const cities = index?.cities ?? [];
  const [openPoi, setOpenPoi] = useState<string | null>(null);

  const cityName = (id?: string | null): string =>
    id ? cities.find((c) => c.id === id)?.name ?? '' : '';

  const days = useMemo(
    () => [...(bundle?.days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [bundle?.days],
  );

  const today = todayStr();
  const defaultDay = days.find((d) => d.date === today)?.id ?? days[0]?.id ?? null;
  const [dayId, setDayId] = useState<string | null>(null);
  const currentId = dayId ?? defaultDay;
  const current = days.find((d) => d.id === currentId);

  if (isLoading) return <div className={s.empty}>读取行程…</div>;
  if (!bundle) return <div className={s.empty}>这份行程不在本机</div>;

  const items = bundle.items.filter((i) => i.dayId === currentId).sort(byRank);
  const closedList = current
    ? items
        .map((i) => (i.poiId ? poiMap?.[i.poiId] : undefined))
        .filter((p) => p && isClosedOn(p.openness, current.date).closed)
    : [];

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div className={s.title}>{bundle.trip.title}</div>
        <div className={s.sub}>
          {current
            ? `${formatCn(current.date)} ${weekdayLabel(current.date)} · ${items.length} 个安排`
            : '还没有排期'}
        </div>
        <div className={s.chips}>
          {days.map((d, i) => (
            <button
              key={d.id}
              className={`${s.chip} ${d.id === currentId ? s.chipOn : ''}`}
              onClick={() => setDayId(d.id)}
            >
              <span className={s.chipIdx}>D{i + 1}</span>
              <span className={s.chipDate}>{d.date.slice(5).replace('-', '/')}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`${s.body} scroll-y`}>
        {closedList.length > 0 && (
          <div className={s.warn}>
            ⚠ 今天 {closedList.map((p) => p!.name).join('、')} 闭馆，去之前先改期
          </div>
        )}
        {current?.note && <div className={s.dayNote}>{current.note}</div>}

        {items.length === 0 && <div className={s.empty}>这天还没安排。回电脑上的作战台排一下吧。</div>}

        {items.map((it, i) => {
          const poi = it.poiId ? poiMap?.[it.poiId] : undefined;
          const ticket = bundle.tickets.find((t) => t.itemId === it.id);
          const kind = it.kind ?? 'poi';
          const isTransport = kind === 'transport';
          const isNote = kind === 'note';
          const icon = isTransport ? TRANSPORT_ICON[it.transportMode ?? 'other'] : isNote ? '📝' : null;
          const title = poi?.name ?? it.customTitle ?? (isTransport ? '交通转场' : '备注');

          const meta: string[] = [];
          if (poi) meta.push(`${formatDuration(poi.visit.durationMinutes)}起`);
          if (it.slotStart) meta.push(it.slotStart.slice(0, 5));
          if (ticket?.booked) meta.push('票已订');
          else if (poi?.booking?.required) meta.push('未订票');
          if (isTransport) {
            const route = [cityName(it.fromCityId), cityName(it.toCityId)].filter(Boolean).join(' → ');
            if (route) meta.push(route);
            if (it.slotEnd) meta.push(`${it.slotStart?.slice(0, 5)}–${it.slotEnd.slice(0, 5)}`);
            else if (it.slotStart) meta.push(it.slotStart.slice(0, 5));
          }
          return (
            <button
              key={it.id}
              className={`${s.card} ${isTransport ? s.cardTransport : ''} ${isNote ? s.cardNote : ''}`}
              onClick={() => poi && setOpenPoi(poi.id)}
              disabled={!poi}
            >
              <span className={s.seq}>{i + 1}</span>
              <span className={s.cardMain}>
                <span className={s.cardName}>
                  {icon && <span className={s.cardIcon}>{icon}</span>}
                  {title}
                </span>
                {meta.length > 0 && <span className={s.cardMeta}>{meta.join(' · ')}</span>}
                {isNote && it.note && <span className={s.cardMeta}>{it.note}</span>}
                {isTransport && it.note && <span className={s.cardMeta}>{it.note}</span>}
              </span>
              <span className={s.statusDot} style={{ background: STATUS_COLOR[it.status] }} />
            </button>
          );
        })}
      </div>

      {openPoi && (
        <div className={s.sheet}>
          <div className={s.sheetHead}>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpenPoi(null)}>
              ← 返回
            </button>
          </div>
          <div className={`${s.sheetBody} scroll-y`}>
            <PoiGuideCard poiId={openPoi} scheduledDate={current?.date ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}
