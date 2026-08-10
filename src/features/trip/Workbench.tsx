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
import { useMemo, useState } from 'react';
import { useRepositories } from '../../data';
import type { TripItem } from '../../data/types';
import { todayStr } from '../../domain/date';
import { byRank, rankBetween, rankForInsert } from '../../domain/trip/rank';
import { sanityCheck, type CheckDay, type CheckPoi } from '../../domain/trip/sanity-check';
import type { Poi } from '../../domain/world/schema';
import { useWorkbench } from '../../store/workbench';
import { PoiGuideCard } from '../world/PoiGuideCard';
import { WorldNav } from '../world/WorldNav';
import { usePoiMap, useWorldIndex } from '../world/queries';
import { useTripBundle, useTripMutations } from './queries';
import { ItemEditor } from './ItemEditor';
import { Timeline } from './Timeline';
import s from './Workbench.module.css';

interface DragData {
  kind: 'world-poi' | 'trip-item' | 'day';
  poiId?: string;
  itemId?: string;
  dayId?: string | null;
}

export function Workbench({ tripId }: { tripId: string }) {
  const { data: bundle, isLoading } = useTripBundle(tripId);
  const { data: index } = useWorldIndex();
  const mut = useTripMutations(tripId);
  const { trip: tripRepo } = useRepositories();
  const { selectedDate, inspector, inspect, closeInspector } = useWorkbench();
  const [dragging, setDragging] = useState<{ label: string } | null>(null);

  const poiIds = useMemo(
    () => Array.from(new Set((bundle?.items ?? []).map((i) => i.poiId).filter((x): x is string => Boolean(x)))),
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className={s.grid}>
        <div className={s.left}>
          <WorldNav onAddPoi={(id) => addPoi(id)} onInspectPoi={(id) => inspect({ type: 'poi', id })} />
        </div>

        <div className={s.center}>
          <Timeline
            bundle={bundle}
            poiMap={poiMap}
            issues={issues}
            cities={index?.cities ?? []}
            mut={mut}
          />
        </div>

        <div className={s.right}>
          <div className={s.rightHead}>
            <span>详情</span>
            {inspector.type !== 'none' && (
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={closeInspector}>
                关闭
              </button>
            )}
          </div>

          <div className={`${s.rightBody} scroll-y`}>
            {inspector.type === 'poi' && (
              <PoiGuideCard
                poiId={inspector.id}
                onAddToTrip={(id) => addPoi(id)}
                scheduledDate={selectedDate}
              />
            )}

            {inspectedItem && (
              <ItemEditor item={inspectedItem} bundle={bundle} mut={mut} cities={index?.cities ?? []} />
            )}

            {inspector.type === 'none' && (
              <div className={s.placeholder}>
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
