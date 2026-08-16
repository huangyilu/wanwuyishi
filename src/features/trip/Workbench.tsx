/**
 * PC 三栏工作台：世界库 · 时间线 · 详情。
 *
 * 全应用只有这一个 DndContext：左栏拖出的是"世界库点位"，中栏拖动的是"行程条目"，
 * 两者落到同一套 droppable 上，落位后统一换算成 fractional rank，只写被拖的那一行。
 */
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useRepositories } from '../../data';
import type { TripItem } from '../../data/types';
import { formatCn, todayStr, weekdayLabel } from '../../domain/date';
import { byRank, rankBetween, rankForInsert } from '../../domain/trip/rank';
import { sanityCheck, type CheckDay, type CheckPoi } from '../../domain/trip/sanity-check';
import type { Poi } from '../../domain/world/schema';
import { useWorkbench } from '../../store/workbench';
import { PoiGuideCard } from '../world/PoiGuideCard';
import { WorldNav } from '../world/WorldNav';
import { usePoiMap, useWorldIndex } from '../world/queries';
import { EmptyArt } from '../../ui/illustrations';
import { useTripBundle, useTripMutations } from './queries';
import { ItemEditor } from './ItemEditor';
import { VotePanel } from './VotePanel';
import { Timeline } from './Timeline';
import s from './Workbench.module.css';

interface DragData {
  kind: 'world-poi' | 'trip-item' | 'day';
  poiId?: string;
  itemId?: string;
  dayId?: string | null;
}

/** 城市 id → 中文名（找不到时回退 id 本身） */
function cityName(cities: { id: string; name: string }[], id?: string | null): string {
  if (!id) return '';
  return cities.find((c) => c.id === id)?.name ?? id;
}

export function Workbench({ tripId }: { tripId: string }) {
  const { data: bundle, isLoading } = useTripBundle(tripId);
  const { data: index } = useWorldIndex();
  const mut = useTripMutations(tripId);
  const { trip: tripRepo } = useRepositories();
  const { selectedDate, setSelectedDate, inspector, inspect, closeInspector } = useWorkbench();
  const [dragging, setDragging] = useState<{ label: string } | null>(null);

  // 三栏手动调宽：左/右两道分隔条。宽度用 --left-w / --right-w 变量驱动，
  // 拖拽时写入 inline style（优先级高于媒体查询），分隔条位置用同一变量自动跟随。
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ side: 'left' | 'right'; startX: number; startLeft: number; startRight: number } | null>(null);
  const [cols, setCols] = useState<{ left: number; right: number } | null>(null);
  const [dragSide, setDragSide] = useState<null | 'left' | 'right'>(null);

  const COL_MIN = { left: 180, right: 240 };
  const COL_MAX = { left: 520, right: 720 };

  function startResize(side: 'left' | 'right', e: ReactPointerEvent<HTMLDivElement>) {
    const grid = gridRef.current;
    if (!grid) return;
    e.preventDefault();
    e.stopPropagation();
    const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat);
    dragRef.current = {
      side,
      startX: e.clientX,
      startLeft: tracks[0] || 288,
      startRight: tracks[2] || 360,
    };
    setDragSide(side);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveResize(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const left = Math.min(COL_MAX.left, Math.max(COL_MIN.left, d.side === 'left' ? d.startLeft + dx : d.startLeft));
    const right = Math.min(COL_MAX.right, Math.max(COL_MIN.right, d.side === 'right' ? d.startRight - dx : d.startRight));
    setCols({ left, right });
  }

  function endResize(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* 已释放 */
    }
    dragRef.current = null;
    setDragSide(null);
  }


  const poiIds = useMemo(
    () => Array.from(new Set((bundle?.items ?? []).map((i) => i.poiId).filter((x): x is string => Boolean(x)))),
    [bundle?.items],
  );
  // 已经加进行程的 POI：传给左栏世界列表，做「已加」标记，避免重复添加
  const addedPoiIds = useMemo(
    () => new Set((bundle?.items ?? []).map((i) => i.poiId).filter((x): x is string => Boolean(x))),
    [bundle?.items],
  );
  const { data: poiMapRaw } = usePoiMap(poiIds);
  const poiMap: Record<string, Poi> = poiMapRaw ?? {};

  /** 当前选中的那一天，决定"+"按钮把点加到哪儿 */
  const targetDayId = useMemo(() => {
    if (!bundle || !selectedDate) return null;
    return bundle.days.find((d) => d.date === selectedDate)?.id ?? null;
  }, [bundle, selectedDate]);

  const issues = useMemo(() => {
    if (!bundle) return [];
    const poiIndex: Record<string, CheckPoi> = {};
    for (const [id, p] of Object.entries(poiMap)) {
      poiIndex[id] = {
        id: p.id,
        name: p.name,
        openness: p.openness,
        location: p.location,
        durationMinutes: p.visit.durationMinutes,
        booking: p.booking ?? null,
      };
    }
    const days: CheckDay[] = [...bundle.days]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((d) => ({
        date: d.date,
        items: bundle.items
          .filter((i) => i.dayId === d.id)
          .sort(byRank)
          .map((i) => ({
            id: i.id,
            poiId: i.poiId,
            status: i.status,
            hasTicket: bundle.tickets.some((t) => t.itemId === i.id && t.booked),
          })),
      }));
    return sanityCheck(days, poiIndex, { today: todayStr() });
  }, [bundle, poiMap]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function itemsIn(dayId: string | null): TripItem[] {
    return (bundle?.items ?? []).filter((i) => i.dayId === dayId).sort(byRank);
  }

  function addPoi(poiId: string, dayId: string | null = targetDayId) {
    const siblings = itemsIn(dayId);
    const rank = rankForInsert(siblings, siblings.length);
    mut.addItem.mutate(
      { dayId, poiId, rank, status: dayId ? 'candidate' : 'wishlist' },
      {
        // 加入行程后直接切到条目编辑，时间/备注立即可填，免去"再去时间线点一遍"的迷惑
        onSuccess: (created) => inspect({ type: 'item', id: created.id }),
      },
    );
  }

  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current as DragData | undefined;
    if (d?.kind === 'world-poi' && d.poiId) {
      const p = index?.pois.find((x) => x.id === d.poiId);
      setDragging({ label: p?.name ?? '点位' });
    } else if (d?.kind === 'trip-item' && d.itemId) {
      const it = bundle?.items.find((x) => x.id === d.itemId);
      const label = it?.poiId ? poiMap[it.poiId]?.name : it?.customTitle;
      setDragging({ label: label ?? '条目' });
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const { active, over } = e;
    if (!over || !bundle) return;

    const a = active.data.current as DragData | undefined;
    const o = over.data.current as DragData | undefined;
    if (!a || !o) return;

    // 落点容器：拖到卡片空白处 = 追加到末尾；拖到某条目上 = 插到它前面
    // 两种 droppable（天卡片本身 / 卡片里的条目）都带着 dayId，取值方式一致
    const toDayId = o.dayId ?? null;

    if (a.kind === 'world-poi' && a.poiId) {
      const siblings = itemsIn(toDayId);
      const idx = o.kind === 'trip-item' ? siblings.findIndex((i) => i.id === o.itemId) : siblings.length;
      const rank = rankForInsert(siblings, idx < 0 ? siblings.length : idx);
      mut.addItem.mutate({ dayId: toDayId, poiId: a.poiId, rank, status: toDayId ? 'candidate' : 'wishlist' });
      return;
    }

    if (a.kind === 'trip-item' && a.itemId) {
      const item = bundle.items.find((i) => i.id === a.itemId);
      if (!item) return;

      let rank: string;
      if (item.dayId === toDayId) {
        const list = itemsIn(toDayId);
        const oldIndex = list.findIndex((i) => i.id === item.id);
        const newIndex = o.kind === 'trip-item' ? list.findIndex((i) => i.id === o.itemId) : list.length - 1;
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
        const moved = arrayMove(list, oldIndex, newIndex);
        rank = rankBetween(moved[newIndex - 1]?.rank ?? null, moved[newIndex + 1]?.rank ?? null);
      } else {
        const list = itemsIn(toDayId);
        const idx = o.kind === 'trip-item' ? list.findIndex((i) => i.id === o.itemId) : list.length;
        rank = rankForInsert(list, idx < 0 ? list.length : idx);
      }
      mut.moveItem.mutate({ id: item.id, dayId: toDayId, rank });
    }
  }

  if (isLoading) return <div className={s.loading}>读取行程…</div>;
  if (!bundle) return <div className={s.error}>这份行程不在本机，换一份或新建一个</div>;

  const inspectedItem =
    inspector.type === 'item' ? bundle.items.find((i) => i.id === inspector.id) : undefined;
  // 看导览卡时，若这个点已经在行程里，顺带把它的实名投票摊开在卡片上方
  const inspectedPoiItem =
    inspector.type === 'poi' ? bundle.items.find((i) => i.poiId === inspector.id) : undefined;

  // 右栏头随选择走：看景点→导览卡 / 看条目→编辑 / 都没选→行程速览
  const detailLabel =
    inspector.type === 'poi' ? '景点导览'
    : inspector.type === 'item' ? '条目编辑'
    : '行程速览';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div
        className={`${s.grid}${dragSide ? ` ${s.resizing}` : ''}`}
        ref={gridRef}
        style={
          cols
            ? ({ '--left-w': `${cols.left}px`, '--right-w': `${cols.right}px` } as CSSProperties)
            : undefined
        }
      >
        <div className={s.left}>
          <WorldNav
            onAddPoi={(id) => addPoi(id)}
            onInspectPoi={(id) => inspect({ type: 'poi', id })}
            addedPoiIds={addedPoiIds}
          />
        </div>

        <div
          className={`${s.resizer} ${s.resizerLeft}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整左栏宽度"
          onPointerDown={(e) => startResize('left', e)}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />

        <div className={s.center}>
          <Timeline
            bundle={bundle}
            poiMap={poiMap}
            issues={issues}
            cities={index?.cities ?? []}
            mut={mut}
          />
        </div>

        <div
          className={`${s.resizer} ${s.resizerRight}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整右栏宽度"
          onPointerDown={(e) => startResize('right', e)}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />

        <div className={s.right}>
          <div className={s.rightHead}>
            <span className={s.rightHeadMark} aria-hidden />
            <span className={s.rightHeadTitle}>{detailLabel}</span>
            {inspector.type !== 'none' && (
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={closeInspector}>
                关闭
              </button>
            )}
          </div>

          <div className={`${s.rightBody} scroll-y`}>
            {inspectedPoiItem && (
              <VotePanel item={inspectedPoiItem} bundle={bundle} mut={mut} />
            )}

            {inspector.type === 'poi' && (
              <PoiGuideCard
                poiId={inspector.id}
                onAddToTrip={(id) => addPoi(id)}
                scheduledDate={selectedDate}
              />
            )}

            {inspectedItem && (
              <ItemEditor key={inspectedItem.id} item={inspectedItem} bundle={bundle} mut={mut} cities={index?.cities ?? []} />
            )}

            {inspector.type === 'none' && (
              <div className={s.placeholder}>
                <div className={s.phArt}>
                  <EmptyArt kind="compass" size={84} />
                </div>
                <h3>{bundle.trip.title}</h3>
                <div className={s.kv}>
                  <span className={s.kvKey}>天数</span>
                  <span className={s.kvVal}>{bundle.days.length} 天</span>
                  <span className={s.kvKey}>已排点</span>
                  <span className={s.kvVal}>
                    {bundle.items.filter((i) => i.dayId).length} / {bundle.items.length}
                  </span>
                  <span className={s.kvKey}>已确定</span>
                  <span className={s.kvVal}>
                    {bundle.items.filter((i) => i.status === 'confirmed').length} 个
                  </span>
                  <span className={s.kvKey}>体检</span>
                  <span className={s.kvVal}>
                    {issues.length === 0 ? '暂无问题' : `${issues.length} 条待处理`}
                  </span>
                  <span className={s.kvKey}>存储</span>
                  <span className={s.kvVal}>
                    {tripRepo.capabilities.canSync ? '云端同步' : '仅本机（未接云端）'}
                  </span>
                </div>

                <div className={s.hint}>
                  这一栏跟着你的选择走：
                  <ul>
                    <li>点左栏的景点 → 出深度导览卡</li>
                    <li>点中间的条目 → 出这条的备注与票务</li>
                    <li>选中某一天后，左栏的「+」就直接加进那天</li>
                  </ul>
                </div>

                {bundle.days.length > 0 && (
                  <div className={s.dailyPlan}>
                    <div className={s.dpHead}>每天行程</div>
                    <ul className={s.dpList}>
                      {[...bundle.days]
                        .sort((a, b) => (a.date < b.date ? -1 : 1))
                        .map((d) => {
                          const dayItems = bundle.items.filter((i) => i.dayId === d.id);
                          const poiN = dayItems.filter((i) => (i.kind ?? 'poi') === 'poi').length;
                          const transN = dayItems.filter((i) => (i.kind ?? 'poi') === 'transport').length;
                          const city = cityName(index?.cities ?? [], d.cityId);
                          const active = selectedDate === d.date;
                          return (
                            <li
                              key={d.id}
                              className={`${s.dpRow}${active ? ` ${s.dpRowActive}` : ''}`}
                              onClick={() => setSelectedDate(active ? null : d.date)}
                              title={active ? '取消选中这一天' : '选中这一天'}
                            >
                              <span className={s.dpDate}>
                                {formatCn(d.date)}
                                <span className={s.dpWeek}>{weekdayLabel(d.date)}</span>
                              </span>
                              <span className={`${s.dpCity}${city ? '' : ` ${s.dpCityEmpty}`}`}>
                                {city || '未选城市'}
                              </span>
                              <span className={s.dpMeta}>
                                {poiN > 0 && `${poiN} 点`}
                                {poiN > 0 && transN > 0 && ' · '}
                                {transN > 0 && `${transN} 段交通`}
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && <div className={s.overlayCard}>{dragging.label}</div>}
      </DragOverlay>
    </DndContext>
  );
}
