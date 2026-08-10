/**
 * 中栏时间线 —— 工作台的主编辑区。
 *
 * 一天一张卡，卡内条目可拖拽排序，卡间可互拖，未排期的落在候选池。
 * 所有写操作都走 useTripMutations 的乐观更新，拖动松手即生效，不等网络。
 * 闭馆/超载/折返/预约死线由 domain 的 sanityCheck 算出后在这里就地提示。
 */
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { lazy, Suspense, useMemo, useState } from 'react';
import type {
  CitySummary,
  ItemStatus,
  TransportMode,
  TripBundle,
  TripDay,
  TripItem,
  TripMember,
} from '../../data/types';
import { addDays, dateRange, formatCn, todayStr, weekdayLabel } from '../../domain/date';
import { isClosedOn } from '../../domain/trip/closure-check';
import { byRank } from '../../domain/trip/rank';
import type { SanityIssue } from '../../domain/trip/sanity-check';
import type { Poi } from '../../domain/world/schema';
import { useWorkbench } from '../../store/workbench';
import { AvatarStack, type VoteTone } from './MemberAvatar';
import { useMyMember } from './useMyMember';
import type { useTripMutations } from './queries';
import s from './Timeline.module.css';

type Mutations = ReturnType<typeof useTripMutations>;

const STATUS_LABEL: Record<ItemStatus, string> = {
  wishlist: '想去',
  candidate: '候选',
  confirmed: '确定',
  visited: '去过',
  dropped: '放弃',
};

/** 地图模式：整程一张图（Leaflet 懒加载，仅在切到地图时下载该块） */
const MapPanel = lazy(() => import('./MapPanel').then((m) => ({ default: m.MapPanel })));

const STATUS_COLOR: Record<ItemStatus, string> = {
  wishlist: 'var(--st-wishlist)',
  candidate: 'var(--st-candidate)',
  confirmed: 'var(--st-confirmed)',
  visited: 'var(--st-visited)',
  dropped: 'var(--st-dropped)',
};

/** 交通方式 → 图标（emoji 跨平台通用，免引图标库） */
const TRANSPORT_ICON: Record<TransportMode, string> = {
  train: '🚄',
  flight: '✈️',
  bus: '🚌',
  ferry: '⛴️',
  car: '🚗',
  walk: '🚶',
  other: '🔁',
};

function cityName(cities: CitySummary[], id?: string | null): string {
  if (!id) return '';
  return cities.find((c) => c.id === id)?.name ?? '';
}

export const POOL_DROP_ID = 'day:pool';
export const dayDropId = (dayId: string) => `day:${dayId}`;
export const itemDragId = (itemId: string) => `item:${itemId}`;

/* ------------------------------- 单个条目 ------------------------------- */

function ItemRow({
  item,
  poi,
  date,
  bundle,
  mut,
  cities,
}: {
  item: TripItem;
  poi: Poi | undefined;
  date: string | null;
  bundle: TripBundle;
  mut: Mutations;
  cities: CitySummary[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemDragId(item.id),
    data: { kind: 'trip-item', itemId: item.id, dayId: item.dayId },
  });
  const { inspector, inspect } = useWorkbench();

  const me = useMyMember(bundle.members);
  const votes = bundle.votes.filter((v) => v.itemId === item.id);
  const score = votes.reduce((n, v) => n + v.value, 0);
  const myVote = me ? votes.find((v) => v.memberId === me.id)?.value ?? 0 : 0;
  const ticket = bundle.tickets.find((t) => t.itemId === item.id);

  // 投票实名：把票映射回成员，想去的排前面，圈圈按人稳定配色
  const voters = votes
    .map((v) => ({ member: bundle.members.find((m) => m.id === v.memberId), value: v.value }))
    .filter((x): x is { member: TripMember; value: 1 | -1 } => Boolean(x.member))
    .sort((a, b) => b.value - a.value);
  const voteToneOf = (m: TripMember): VoteTone =>
    (voters.find((x) => x.member.id === m.id)?.value ?? 0) === 1 ? 'up' : 'down';

  const kind = item.kind ?? 'poi';
  const isCustom = kind !== 'poi';
  const closed = poi && date ? isClosedOn(poi.openness, date) : { closed: false };
  const selected = inspector.type === 'item' && inspector.id === item.id;

  const title = poi?.name ?? item.customTitle ?? (kind === 'transport' ? '交通转场' : '备注');

  const sub: string[] = [];
  if (kind === 'poi') {
    if (poi)
      sub.push(
        `${Math.round((poi.visit.durationMinutes[0] / 60) * 10) / 10}-${Math.round((poi.visit.durationMinutes[1] / 60) * 10) / 10} 小时`,
      );
    if (item.slotStart)
      sub.push(item.slotEnd ? `${item.slotStart.slice(0, 5)}–${item.slotEnd.slice(0, 5)}` : item.slotStart.slice(0, 5));
    if (poi?.booking?.required) sub.push(ticket?.booked ? '已订票' : `需提前 ${poi.booking.leadDays} 天订`);
    if (item.note) sub.push(item.note);
  } else if (kind === 'transport') {
    const route = [cityName(cities, item.fromCityId), cityName(cities, item.toCityId)]
      .filter(Boolean)
      .join(' → ');
    if (route) sub.push(route);
    if (item.slotStart)
      sub.push(item.slotEnd ? `${item.slotStart.slice(0, 5)}–${item.slotEnd.slice(0, 5)}` : item.slotStart.slice(0, 5));
    if (item.note) sub.push(item.note);
  } else if (item.note) {
    sub.push(item.note);
  }

  const icon = kind === 'transport' ? TRANSPORT_ICON[item.transportMode ?? 'other'] : kind === 'note' ? '📝' : null;

  function castVote(value: 1 | -1) {
    if (!me) return;
    mut.vote.mutate({ itemId: item.id, memberId: me.id, value: myVote === value ? 0 : value });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        s.item,
        isDragging ? s.itemDragging : '',
        selected ? s.itemSelected : '',
        item.status === 'dropped' ? s.itemDropped : '',
        isCustom ? s.itemCustom : '',
        kind === 'transport' ? s.itemTransport : '',
        kind === 'note' ? s.itemNote : '',
      ].join(' ')}
    >
      <div className={s.handle} {...listeners} {...attributes} title="拖动调整顺序">
        ⠿
      </div>

      <span className={s.statusDot} style={{ background: STATUS_COLOR[item.status] }} />

      {icon && <span className={s.itemKind}>{icon}</span>}

      <div
        className={s.itemMain}
        onClick={() => inspect(poi ? { type: 'poi', id: poi.id } : { type: 'item', id: item.id })}
      >
        <div className={s.itemName}>
          {title}
          {closed.closed && <span className={s.closedFlag}>· 闭馆</span>}
        </div>
        {sub.length > 0 && <div className={s.itemSub}>{sub.join(' · ')}</div>}
        {(item.images?.length ?? 0) > 0 && (
          <div className={s.itemThumbs}>
            <img className={s.itemThumb} src={item.images![0]} alt="附件" />
            {item.images!.length > 1 && <span className={s.itemThumbMore}>+{item.images!.length - 1}</span>}
          </div>
        )}
      </div>

      {!isCustom && (
        <div className={s.votes}>
          <button
            className={`${s.voteBtn} ${myVote === 1 ? s.voteOn : ''}`}
            onClick={() => castVote(1)}
            title={me ? `${me.displayName}：想去` : '想去'}
          >
            ▲
          </button>
          {voters.length > 0 && (
            <AvatarStack
              members={voters.map((v) => v.member)}
              size={18}
              max={4}
              meId={me?.id ?? null}
              toneOf={voteToneOf}
              labelOf={(m) =>
                `${m.displayName}${m.id === me?.id ? '（我）' : ''} · ${
                  voteToneOf(m) === 'up' ? '想去' : '不太想'
                }`
              }
            />
          )}
          <span className={`${s.voteNum} num`} title={`净分 ${score}`}>
            {score !== 0 ? score : ''}
          </span>
          <button
            className={`${s.voteBtn} ${myVote === -1 ? s.voteOn : ''}`}
            onClick={() => castVote(-1)}
            title={me ? `${me.displayName}：不太想` : '不太想'}
          >
            ▼
          </button>
        </div>
      )}

      {kind !== 'note' && (
        <select
          className={s.statusSelect}
          value={item.status}
          onChange={(e) =>
            mut.updateItem.mutate({ id: item.id, patch: { status: e.target.value as ItemStatus } })
          }
          title="状态"
        >
          {(Object.keys(STATUS_LABEL) as ItemStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
      )}

      <button className={s.del} onClick={() => mut.removeItem.mutate(item.id)} title="移除">
        ×
      </button>
    </div>
  );
}

/* -------------------------------- 一天 --------------------------------- */

function DayCard({
  day,
  index,
  items,
  poiMap,
  cities,
  issues,
  bundle,
  mut,
  onAddCustom,
}: {
  day: TripDay;
  index: number;
  items: TripItem[];
  poiMap: Record<string, Poi>;
  cities: CitySummary[];
  issues: SanityIssue[];
  bundle: TripBundle;
  mut: Mutations;
  onAddCustom: (kind: 'transport' | 'note') => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dayDropId(day.id),
    data: { kind: 'day', dayId: day.id },
  });
  const { selectedDate, setSelectedDate } = useWorkbench();

  const active = selectedDate === day.date;
  const minutes = items.reduce((n, it) => {
    const p = it.poiId ? poiMap[it.poiId] : undefined;
    return n + (p ? p.visit.durationMinutes[0] : 0);
  }, 0);
  const transportCount = items.filter((i) => (i.kind ?? 'poi') === 'transport').length;
  const hasError = issues.some((i) => i.level === 'error');

  return (
    <div className={`${s.day} ${active ? s.dayActive : ''} ${isOver ? s.dayOver : ''}`}>
      <div className={s.dayHead} onClick={() => setSelectedDate(active ? null : day.date)}>
        <span className={s.dayIdx}>D{index + 1}</span>
        <span className={s.dayDate}>{formatCn(day.date)}</span>
        <span className={s.dayWeek}>{weekdayLabel(day.date)}</span>
        <select
          className={s.citySelect}
          value={day.cityId ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            mut.updateDay.mutate({ id: day.id, patch: { cityId: e.target.value || null } })
          }
        >
          <option value="">选择城市</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className={`${s.dayStat} ${hasError ? s.dayWarn : ''}`}>
          {items.length > 0 &&
            `${items.length} 个点 · 约 ${(minutes / 60).toFixed(1)}h${transportCount > 0 ? ` · ${transportCount} 段交通` : ''}`}
          {hasError && ' · 有冲突'}
        </span>
        <span className={s.addBtns}>
          <button className={s.addBtn} title="加一段交通转场" onClick={(e) => { e.stopPropagation(); onAddCustom('transport'); }}>
            🚄
          </button>
          <button className={s.addBtn} title="加一条备注" onClick={(e) => { e.stopPropagation(); onAddCustom('note'); }}>
            📝
          </button>
        </span>
        <button
          className={s.del}
          onClick={(e) => {
            e.stopPropagation();
            mut.removeDay.mutate(day.id);
          }}
          title="删除这一天（条目退回候选池）"
        >
          ×
        </button>
      </div>

      <div ref={setNodeRef} className={s.items}>
        <SortableContext items={items.map((i) => itemDragId(i.id))} strategy={verticalListSortingStrategy}>
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              poi={it.poiId ? poiMap[it.poiId] : undefined}
              date={day.date}
              bundle={bundle}
              mut={mut}
              cities={cities}
            />
          ))}
        </SortableContext>
        {items.length === 0 && <div className={s.dropHint}>把左侧的点拖到这里，或点 🚄 加一段交通转场</div>}
      </div>
    </div>
  );
}

/* ------------------------------ 候选池 ---------------------------------- */

function PoolCard({
  items,
  poiMap,
  bundle,
  mut,
  cities,
  onAddCustom,
}: {
  items: TripItem[];
  poiMap: Record<string, Poi>;
  bundle: TripBundle;
  mut: Mutations;
  cities: CitySummary[];
  onAddCustom: (kind: 'transport' | 'note') => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: POOL_DROP_ID,
    data: { kind: 'day', dayId: null },
  });

  return (
    <div className={`${s.pool} ${isOver ? s.dayOver : ''}`}>
      <div className={s.poolHead}>
        <span>候选池</span>
        <span className="muted">还没定哪天去的点，先攒在这里</span>
        <span className={s.dayStat}>{items.length > 0 && `${items.length} 个`}</span>
        <span className={s.addBtns}>
          <button className={s.addBtn} title="加一段交通转场" onClick={() => onAddCustom('transport')}>
            🚄
          </button>
          <button className={s.addBtn} title="加一条备注" onClick={() => onAddCustom('note')}>
            📝
          </button>
        </span>
      </div>
      <div ref={setNodeRef} className={s.items}>
        <SortableContext items={items.map((i) => itemDragId(i.id))} strategy={verticalListSortingStrategy}>
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              poi={it.poiId ? poiMap[it.poiId] : undefined}
              date={null}
              bundle={bundle}
              mut={mut}
              cities={cities}
            />
          ))}
        </SortableContext>
        {items.length === 0 && <div className={s.dropHint}>拿不准的点先丢进来</div>}
      </div>
    </div>
  );
}

/* ------------------------------- 时间线 --------------------------------- */

export function Timeline({
  bundle,
  poiMap,
  issues,
  cities,
  mut,
}: {
  bundle: TripBundle;
  poiMap: Record<string, Poi>;
  issues: SanityIssue[];
  cities: CitySummary[];
  mut: Mutations;
}) {
  const { showSanity, toggleSanity, inspect } = useWorkbench();
  const [title, setTitle] = useState(bundle.trip.title);
  const [view, setView] = useState<'timeline' | 'map'>('timeline');

  /** 加一段交通 / 一条备注：先建条目并自动打开右栏编辑面板 */
  async function addCustom(kind: 'transport' | 'note', dayId: string | null) {
    const created = await mut.addItem.mutateAsync({
      dayId,
      kind,
      status: 'candidate',
    });
    inspect({ type: 'item', id: created.id });
  }

  const days = useMemo(() => [...bundle.days].sort((a, b) => (a.date < b.date ? -1 : 1)), [bundle.days]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, TripItem[]>();
    for (const it of bundle.items) {
      const k = it.dayId ?? '__pool__';
      const list = map.get(k) ?? [];
      list.push(it);
      map.set(k, list);
    }
    for (const list of map.values()) list.sort(byRank);
    return map;
  }, [bundle.items]);

  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;

  /**
   * 设了起止日期就把中间的天一次性补齐，省得一天天点。
   * 串行 await：本地档是"读—改—写"整份存储，并发写会互相覆盖。
   */
  async function applyRange(start: string | null, end: string | null) {
    await mut.updateTrip.mutateAsync({ startDate: start, endDate: end });
    if (!start || !end || start > end) return;
    const exist = new Set(days.map((d) => d.date));
    for (const d of dateRange(start, end)) {
      if (!exist.has(d)) await mut.addDay.mutateAsync({ date: d });
    }
  }

  function addNextDay() {
    const last = days[days.length - 1];
    const date = last ? addDays(last.date, 1) : bundle.trip.startDate ?? todayStr();
    mut.addDay.mutate({ date });
  }

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div className={s.headRow}>
          <input
            className={s.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== bundle.trip.title && mut.updateTrip.mutate({ title })}
          />
          <div className={s.seg} role="tablist" aria-label="编辑视图">
            <button
              className={`${s.segBtn} ${view === 'timeline' ? s.segOn : ''}`}
              onClick={() => setView('timeline')}
              role="tab"
              aria-selected={view === 'timeline'}
            >
              时间线
            </button>
            <button
              className={`${s.segBtn} ${view === 'map' ? s.segOn : ''}`}
              onClick={() => setView('map')}
              role="tab"
              aria-selected={view === 'map'}
            >
              地图
            </button>
          </div>
          <button className={s.sanityBtn} onClick={toggleSanity} title="行程体检">
            体检
            {errors > 0 ? (
              <span className={s.badgeErr}>{errors} 个冲突</span>
            ) : warns > 0 ? (
              <span className={s.badgeWarn}>{warns} 条提醒</span>
            ) : (
              <span className={s.badgeOk}>通过</span>
            )}
          </button>
        </div>

        <div className={s.metaRow}>
          <input
            className={s.dateInput}
            type="date"
            value={bundle.trip.startDate ?? ''}
            onChange={(e) => void applyRange(e.target.value || null, bundle.trip.endDate)}
          />
          <span>→</span>
          <input
            className={s.dateInput}
            type="date"
            value={bundle.trip.endDate ?? ''}
            onChange={(e) => void applyRange(bundle.trip.startDate, e.target.value || null)}
          />
          <span>共 {days.length} 天 · {bundle.items.length} 个点</span>

          <div className={s.members}>
            {bundle.members.map((m) => (
              <span
                key={m.id}
                className={`${s.member} ${m.userId ? '' : s.memberGhost}`}
                title={m.userId ? m.displayName : `${m.displayName}（未注册，可投票记账）`}
              >
                {m.displayName.slice(0, 1)}
              </span>
            ))}
            <button
              className={s.member}
              title="加同行人"
              onClick={() => {
                const name = window.prompt('同行人名字（不需要对方注册）');
                if (name?.trim()) mut.addMember.mutate(name.trim());
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {view === 'map' ? (
        <div className={s.mapArea}>
          <Suspense fallback={<div className={s.loading}>加载地图…</div>}>
            <MapPanel bundle={bundle} poiMap={poiMap} cities={cities} mut={mut} />
          </Suspense>
        </div>
      ) : (
        <div className={`${s.scroll} scroll-y`}>
        {showSanity && issues.length > 0 && (
          <div className={s.issues}>
            {issues.slice(0, 8).map((iss, i) => (
              <div key={i} className={`${s.issue} ${iss.level === 'error' ? s.issueError : ''}`}>
                <span className={s.issueIcon}>{iss.level === 'error' ? '⛔' : '⚠️'}</span>
                <span>{iss.message}</span>
              </div>
            ))}
          </div>
        )}

        {days.length === 0 && bundle.items.length === 0 && (
          <div className={s.emptyTrip}>
            先在上面选好起止日期，或者直接点下面的「添加一天」，
            <br />
            然后把左边世界库里的点拖进来。
          </div>
        )}

        <div style={{ marginTop: issues.length > 0 && showSanity ? 12 : 0 }}>
          {days.map((day, i) => (
            <DayCard
              key={day.id}
              day={day}
              index={i}
              items={itemsByDay.get(day.id) ?? []}
              poiMap={poiMap}
              cities={cities}
              issues={issues.filter((x) => x.date === day.date)}
              bundle={bundle}
              mut={mut}
              onAddCustom={(k) => addCustom(k, day.id)}
            />
          ))}
        </div>

        <button className={s.addDay} onClick={addNextDay}>
          + 添加一天
        </button>

        <PoolCard
          items={itemsByDay.get('__pool__') ?? []}
          poiMap={poiMap}
          bundle={bundle}
          mut={mut}
          cities={cities}
          onAddCustom={(k) => addCustom(k, null)}
        />
        </div>
      )}
    </div>
  );
}
