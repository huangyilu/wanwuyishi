/**
 * 行程 adapter · 本地开发档（localStorage）。
 *
 * 定位说明：技术方案里行程数据的事实源是 Supabase，本 adapter 不是"先本地后迁移"的过渡形态，
 * 而是**没有配置 Supabase 凭据时的开发与演示档**——保证 clone 下来就能跑、单机就能把
 * 工作台的交互全部走通。凭据一填，工厂立刻切到 SupabaseTripRepository，接口完全一致。
 *
 * 因此这里刻意做了两件事：
 *   1. 数据结构与 SQL 表逐字段对齐（含 updatedAt），迁移时无需转换
 *   2. canSync = false，UI 会显示"仅本机"的状态标记，不会让人误以为已经在协作
 */
import { initialRank, rankBetween } from '../../domain/trip/rank';
import type {
  AddItemInput,
  CreateTripInput,
  Expense,
  ItemVote,
  Ticket,
  Trip,
  TripBundle,
  TripDay,
  TripItem,
  TripInvite,
  TripMember,
  TripRepository,
} from '../types';

const KEY = 'wwys:trips:v1';

interface Store {
  bundles: Record<string, TripBundle>;
  order: string[];
}

function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

function now(): string {
  return new Date().toISOString();
}

function emptyStore(): Store {
  return { bundles: {}, order: [] };
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Store;
    if (!parsed.bundles || !parsed.order) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function write(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export class LocalTripRepository implements TripRepository {
  readonly kind = 'local' as const;
  readonly capabilities = { canWrite: true, canSync: false };

  private mutate<T>(tripId: string, fn: (b: TripBundle, store: Store) => T): T {
    const store = read();
    const bundle = store.bundles[tripId];
    if (!bundle) throw new Error(`行程不存在：${tripId}`);
    const result = fn(bundle, store);
    bundle.trip.updatedAt = now();
    write(store);
    return result;
  }

  /** 跨行程查找实体所属的 bundle（item/ticket/expense 的 id 全局唯一） */
  private findBundleBy(pred: (b: TripBundle) => boolean): { store: Store; bundle: TripBundle } {
    const store = read();
    const bundle = Object.values(store.bundles).find(pred);
    if (!bundle) throw new Error('找不到对应的行程数据');
    return { store, bundle };
  }

  async listTrips(): Promise<Trip[]> {
    const store = read();
    return store.order
      .map((id) => store.bundles[id]?.trip)
      .filter((t): t is Trip => Boolean(t))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async getBundle(tripId: string): Promise<TripBundle | null> {
    const bundle = read().bundles[tripId];
    if (!bundle) return null;
    // 归一化旧档：补全 kind 字段，避免渲染层到处写 `item.kind ?? 'poi'`；
    // 旧账单无 splitMode 时默认 'aa'（共同分摊），与历史行为一致
    return {
      ...bundle,
      items: bundle.items.map((it) => ({ ...it, kind: it.kind ?? 'poi', images: it.images ?? [] })) as TripItem[],
      tickets: bundle.tickets.map((t) => ({ ...t, attachments: t.attachments ?? [] })) as typeof bundle.tickets,
      expenses: bundle.expenses.map((e) => ({ ...e, splitMode: e.splitMode ?? 'aa' })) as typeof bundle.expenses,
      trip: {
        ...bundle.trip,
        packing: (bundle.trip.packing ?? []).map((it) => ({
          ...it,
          ownerId: it.ownerId ?? null,
          assigneeId: it.assigneeId ?? null,
        })),
      },
    };
  }

  async createTrip(input: CreateTripInput): Promise<Trip> {
    const store = read();
    const id = uid('trip');
    const trip: Trip = {
      id,
      ownerId: 'local-user',
      title: input.title,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      baseCurrency: input.baseCurrency ?? 'CNY',
      preferences: {},
      status: 'planning',
      packing: [],
      updatedAt: now(),
    };
    const owner: TripMember = {
      id: uid('member'),
      tripId: id,
      userId: 'local-user',
      displayName: '我',
      role: 'owner',
      color: '#FF6B4A',
    };
    store.bundles[id] = {
      trip,
      members: [owner],
      days: [],
      items: [],
      votes: [],
      tickets: [],
      expenses: [],
    };
    store.order.unshift(id);
    write(store);
    return trip;
  }

  async updateTrip(id: string, patch: Partial<Trip>): Promise<Trip> {
    return this.mutate(id, (b) => {
      Object.assign(b.trip, patch, { id, updatedAt: now() });
      return b.trip;
    });
  }

  async deleteTrip(id: string): Promise<void> {
    const store = read();
    delete store.bundles[id];
    store.order = store.order.filter((x) => x !== id);
    write(store);
  }

  async addDay(tripId: string, date: string, cityId: string | null = null): Promise<TripDay> {
    return this.mutate(tripId, (b) => {
      const exist = b.days.find((d) => d.date === date);
      if (exist) return exist;
      const day: TripDay = { id: uid('day'), tripId, date, cityId, note: null };
      b.days.push(day);
      b.days.sort((x, y) => (x.date < y.date ? -1 : 1));
      return day;
    });
  }

  async updateDay(id: string, patch: Partial<TripDay>): Promise<TripDay> {
    const { store, bundle } = this.findBundleBy((b) => b.days.some((d) => d.id === id));
    const day = bundle.days.find((d) => d.id === id)!;
    Object.assign(day, patch, { id });
    bundle.days.sort((x, y) => (x.date < y.date ? -1 : 1));
    bundle.trip.updatedAt = now();
    write(store);
    return day;
  }

  async removeDay(id: string): Promise<void> {
    const { store, bundle } = this.findBundleBy((b) => b.days.some((d) => d.id === id));
    bundle.days = bundle.days.filter((d) => d.id !== id);
    // 该天的条目退回候选池，不直接删除，避免误删用户攒的点
    for (const it of bundle.items) if (it.dayId === id) it.dayId = null;
    bundle.trip.updatedAt = now();
    write(store);
  }

  async addItem(input: AddItemInput): Promise<TripItem> {
    return this.mutate(input.tripId, (b) => {
      const siblings = b.items
        .filter((i) => i.dayId === input.dayId)
        .sort((x, y) => (x.rank < y.rank ? -1 : 1));
      const last = siblings[siblings.length - 1];
      const kind = input.kind ?? 'poi';
      // 交通 / 备注没有 poiId，必须有 customTitle 才能过约束（poi_id 或 custom_title 至少一个）
      const customTitle =
        input.customTitle ??
        (kind === 'transport' ? '交通' : kind === 'note' ? '备注' : kind === 'accommodation' ? '住宿' : null);
      const item: TripItem = {
        id: uid('item'),
        tripId: input.tripId,
        dayId: input.dayId,
        kind,
        poiId: input.poiId ?? null,
        customTitle,
        transportMode: kind === 'transport' ? (input.transportMode ?? 'train') : null,
        fromCityId: kind === 'transport' ? (input.fromCityId ?? null) : null,
        toCityId: kind === 'transport' ? (input.toCityId ?? null) : null,
        rank: input.rank ?? (last ? rankBetween(last.rank, null) : initialRank()),
        slotStart: null,
        slotEnd: null,
        status: input.status ?? 'candidate',
        note: null,
        address: null,
        images: [],
        updatedAt: now(),
      };
      b.items.push(item);
      return item;
    });
  }

  async updateItem(id: string, patch: Partial<TripItem>): Promise<TripItem> {
    const { store, bundle } = this.findBundleBy((b) => b.items.some((i) => i.id === id));
    const item = bundle.items.find((i) => i.id === id)!;
    Object.assign(item, patch, { id, updatedAt: now() });
    bundle.trip.updatedAt = now();
    write(store);
    return item;
  }

  async moveItem(id: string, to: { dayId: string | null; rank: string }): Promise<TripItem> {
    return this.updateItem(id, { dayId: to.dayId, rank: to.rank });
  }

  async removeItem(id: string): Promise<void> {
    const { store, bundle } = this.findBundleBy((b) => b.items.some((i) => i.id === id));
    bundle.items = bundle.items.filter((i) => i.id !== id);
    bundle.votes = bundle.votes.filter((v) => v.itemId !== id);
    for (const t of bundle.tickets) if (t.itemId === id) t.itemId = null;
    bundle.trip.updatedAt = now();
    write(store);
  }

  async addMember(tripId: string, displayName: string): Promise<TripMember> {
    return this.mutate(tripId, (b) => {
      // userId 为 null 即幽灵成员：能投票、能记账、能被结算，就是没有账号
      const member: TripMember = {
        id: uid('member'),
        tripId,
        userId: null,
        displayName,
        role: 'member',
        color: null,
      };
      b.members.push(member);
      return member;
    });
  }

  async removeMember(id: string): Promise<void> {
    const { store, bundle } = this.findBundleBy((b) => b.members.some((m) => m.id === id));
    const hasExpense = bundle.expenses.some(
      (e) => e.payerMemberId === id || e.shares.some((s) => s.memberId === id),
    );
    if (hasExpense) throw new Error('该成员已有账本记录，先处理账目再移除');
    bundle.members = bundle.members.filter((m) => m.id !== id);
    bundle.votes = bundle.votes.filter((v) => v.memberId !== id);
    bundle.trip.updatedAt = now();
    write(store);
  }

  // 协作邀请是云端特性（依赖 Supabase 账号体系与 RLS），本地存储不支持
  async createInvite(): Promise<TripInvite> {
    throw new Error('协作邀请仅云端模式支持，请先登录云端');
  }
  async listInvites(): Promise<TripInvite[]> {
    return [];
  }
  async revokeInvite(): Promise<void> {
    throw new Error('协作邀请仅云端模式支持，请先登录云端');
  }
  async joinTripByToken(): Promise<void> {
    throw new Error('加入行程仅云端模式支持，请先登录云端');
  }

  async vote(itemId: string, memberId: string, value: 1 | -1 | 0): Promise<void> {
    const { store, bundle } = this.findBundleBy((b) => b.items.some((i) => i.id === itemId));
    bundle.votes = bundle.votes.filter((v) => !(v.itemId === itemId && v.memberId === memberId));
    if (value !== 0) bundle.votes.push({ itemId, memberId, value } as ItemVote);
    bundle.trip.updatedAt = now();
    write(store);
  }

  async upsertTicket(input: Omit<Ticket, 'id'> & { id?: string }): Promise<Ticket> {
    return this.mutate(input.tripId, (b) => {
      if (input.id) {
        const t = b.tickets.find((x) => x.id === input.id);
        if (t) {
          Object.assign(t, input);
          return t;
        }
      }
      const ticket: Ticket = { ...input, id: input.id ?? uid('ticket') };
      b.tickets.push(ticket);
      return ticket;
    });
  }

  async removeTicket(id: string): Promise<void> {
    const { store, bundle } = this.findBundleBy((b) => b.tickets.some((t) => t.id === id));
    bundle.tickets = bundle.tickets.filter((t) => t.id !== id);
    bundle.trip.updatedAt = now();
    write(store);
  }

  async upsertExpense(input: Omit<Expense, 'id'> & { id?: string }): Promise<Expense> {
    return this.mutate(input.tripId, (b) => {
      if (input.id) {
        const e = b.expenses.find((x) => x.id === input.id);
        if (e) {
          Object.assign(e, input);
          return e;
        }
      }
      const expense: Expense = { ...input, id: input.id ?? uid('exp') };
      b.expenses.push(expense);
      return expense;
    });
  }

  async removeExpense(id: string): Promise<void> {
    const { store, bundle } = this.findBundleBy((b) => b.expenses.some((e) => e.id === id));
    bundle.expenses = bundle.expenses.filter((e) => e.id !== id);
    bundle.trip.updatedAt = now();
    write(store);
  }
}
