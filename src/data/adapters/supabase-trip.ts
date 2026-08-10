/**
 * 行程 adapter · Supabase 云端。
 *
 * 字段与 supabase/migrations/0001_init.sql 逐列对齐（camelCase ↔ snake_case），
 * 因此与 LocalTripRepository 在视图层完全可互换——工厂选哪个，UI 无感。
 *
 * 几个实现要点（对应迁移里的设计）：
 *   - `getBundle` 走 RPC `get_trip_bundle(p_trip_id)`，一次往返拿全量（避免 6+ 次请求）
 *   - `removeDay` 直接删 trip_days，trip_items.day_id 因 `on delete set null` 自动退回候选池
 *   - `removeItem` 直接删 trip_items，item_votes 级联删、tickets.item_id 级联置 null
 *   - 写操作受 RLS 约束（is_trip_member / is_trip_owner），未登录会被拒——所以必须先用 AuthBar 登录
 *   - expense_shares 与 expenses 分开维护（先删后插，非原子但 RLS 保护）
 */
import { initialRank, rankBetween } from '../../domain/trip/rank';
import { supabase } from '../supabase-client';
import type {
  AddItemInput,
  CreateTripInput,
  Expense,
  ItemKind,
  ItemVote,
  PackingItem,
  Ticket,
  Trip,
  TripBundle,
  TripDay,
  TripItem,
  TripInvite,
  TripMember,
  TripRepository,
} from '../types';

/* ---------------------------------- 映射 ---------------------------------- */

function mapTrip(r: any): Trip {
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    baseCurrency: r.base_currency,
    preferences: (r.preferences as { excludeTags?: string[] }) ?? {},
    sourceTripId: r.source_trip_id ?? null,
    sourceLabel: r.source_label ?? null,
    status: r.status,
    packing: ((r.packing as PackingItem[]) ?? []).map((it) => ({
      ...it,
      ownerId: it.ownerId ?? null,
      assigneeId: it.assigneeId ?? null,
    })),
    updatedAt: r.updated_at,
  };
}

function mapMember(r: any): TripMember {
  return {
    id: r.id,
    tripId: r.trip_id,
    userId: r.user_id ?? null,
    displayName: r.display_name,
    role: r.role,
    color: r.color ?? null,
  };
}

function mapDay(r: any): TripDay {
  return {
    id: r.id,
    tripId: r.trip_id,
    date: r.date,
    cityId: r.city_id ?? null,
    note: r.note ?? null,
  };
}

function mapItem(r: any): TripItem {
  return {
    id: r.id,
    tripId: r.trip_id,
    dayId: r.day_id ?? null,
    kind: (r.kind as ItemKind) ?? 'poi',
    poiId: r.poi_id ?? null,
    customTitle: r.custom_title ?? null,
    transportMode: r.transport_mode ?? null,
    fromCityId: r.from_city_id ?? null,
    toCityId: r.to_city_id ?? null,
    rank: r.rank,
    slotStart: r.slot_start ? String(r.slot_start).slice(0, 5) : null,
    slotEnd: r.slot_end ? String(r.slot_end).slice(0, 5) : null,
    status: r.status,
    note: r.note ?? null,
    images: (r.images as string[] | null) ?? [],
    updatedAt: r.updated_at,
  };
}

function mapVote(r: any): ItemVote {
  return { itemId: r.item_id, memberId: r.member_id, value: r.value };
}

function mapTicket(r: any): Ticket {
  return {
    id: r.id,
    tripId: r.trip_id,
    itemId: r.item_id ?? null,
    title: r.title,
    channel: r.channel ?? null,
    officialUrl: r.official_url ?? null,
    priceCents: r.price_cents ?? null,
    currency: r.currency ?? null,
    timeSlot: r.time_slot ?? null,
    bookingRef: r.booking_ref ?? null,
    booked: r.booked,
    leadDays: r.lead_days ?? null,
    note: r.note ?? null,
  };
}

function mapExpense(r: any): Omit<Expense, 'shares'> {
  return {
    id: r.id,
    tripId: r.trip_id,
    dayId: r.day_id ?? null,
    itemId: r.item_id ?? null,
    category: r.category,
    title: r.title,
    amountCents: r.amount_cents,
    currency: r.currency,
    fxRate: Number(r.fx_rate),
    payerMemberId: r.payer_member_id,
    spentAt: r.spent_at,
    note: r.note ?? null,
    splitMode: (r.split_mode as 'aa' | 'personal') ?? 'aa',
  };
}

/* --------------------------------- 适配器 --------------------------------- */

export class SupabaseTripRepository implements TripRepository {
  readonly kind = 'supabase' as const;
  readonly capabilities = { canWrite: true, canSync: true };

  private get c() {
    if (!supabase) throw new Error('Supabase 未配置');
    return supabase;
  }

  async listTrips(): Promise<Trip[]> {
    const { data, error } = await this.c
      .from('trips')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTrip);
  }

  async getBundle(tripId: string): Promise<TripBundle | null> {
    const { data, error } = await this.c.rpc('get_trip_bundle', { p_trip_id: tripId });
    if (error) {
      // RPC 内对「非成员」显式 raise 'FORBIDDEN'，属于权限问题，交给上层提示登录
      if (String(error.message).toUpperCase().includes('FORBIDDEN')) throw error;
      return null;
    }
    if (!data || !data.trip) return null;

    const members = (data.members ?? []).map(mapMember);
    // 别名统一：有 profile 的成员用其 profiles.display_name（全局昵称）覆盖冗余存的名字；
    // 幽灵成员（user_id 为空）保留 trip_members 原值。RPC 以 security definer 绕过 profiles RLS 读取同伴别名。
    try {
      const { data: aliasJson } = await this.c.rpc('get_member_aliases', { p_trip_id: tripId });
      const aliasMap: Record<string, string> = (aliasJson as Record<string, string>) ?? {};
      for (const m of members) {
        if (m.userId && aliasMap[m.userId]) m.displayName = aliasMap[m.userId];
      }
    } catch {
      /* 别名查询失败降级为 trip_members 原有名字，不阻断主流程 */
    }

    const shares = (data.expenseShares ?? []) as any[];
    const expenses = (data.expenses ?? []).map((e: any) => ({
      ...mapExpense(e),
      shares: shares
        .filter((s) => s.expense_id === e.id)
        .map((s) => ({ memberId: s.member_id, weight: Number(s.weight) })),
    }));

    return {
      trip: mapTrip(data.trip),
      members,
      days: (data.days ?? []).map(mapDay),
      items: (data.items ?? []).map(mapItem),
      votes: (data.votes ?? []).map(mapVote),
      tickets: (data.tickets ?? []).map(mapTicket),
      expenses,
    };
  }

  async createTrip(input: CreateTripInput): Promise<Trip> {
    const user = (await this.c.auth.getUser()).data.user;
    if (!user) throw new Error('未登录，无法创建云端行程');
    const { data, error } = await this.c
      .from('trips')
      .insert({
        owner_id: user.id,
        title: input.title,
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        base_currency: input.baseCurrency ?? 'CNY',
        status: 'planning',
        preferences: {},
      })
      .select()
      .single();
    if (error) throw error;
    return mapTrip(data);
  }

  async updateTrip(id: string, patch: Partial<Trip>): Promise<Trip> {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.startDate !== undefined) row.start_date = patch.startDate;
    if (patch.endDate !== undefined) row.end_date = patch.endDate;
    if (patch.baseCurrency !== undefined) row.base_currency = patch.baseCurrency;
    if (patch.preferences !== undefined) row.preferences = patch.preferences;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.packing !== undefined) row.packing = patch.packing;
    const { data, error } = await this.c
      .from('trips')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapTrip(data);
  }

  async deleteTrip(id: string): Promise<void> {
    const { error } = await this.c.from('trips').delete().eq('id', id);
    if (error) throw error;
  }

  async addDay(tripId: string, date: string, cityId: string | null = null): Promise<TripDay> {
    const { data, error } = await this.c
      .from('trip_days')
      .insert({ trip_id: tripId, date, city_id: cityId })
      .select()
      .single();
    if (error) throw error;
    return mapDay(data);
  }

  async updateDay(id: string, patch: Partial<TripDay>): Promise<TripDay> {
    const row: Record<string, unknown> = {};
    if (patch.date !== undefined) row.date = patch.date;
    if (patch.cityId !== undefined) row.city_id = patch.cityId;
    if (patch.note !== undefined) row.note = patch.note;
    const { data, error } = await this.c
      .from('trip_days')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapDay(data);
  }

  async removeDay(id: string): Promise<void> {
    const { error } = await this.c.from('trip_days').delete().eq('id', id);
    if (error) throw error;
  }

  async addItem(input: AddItemInput): Promise<TripItem> {
    const kind = input.kind ?? 'poi';
    // 交通 / 备注没有 poiId，必须有 custom_title 才能过约束（poi_id 或 custom_title 至少一个）。
    // 与 LocalTripRepository 保持一致：未显式给标题时按类型兜底。
    const customTitle =
      input.customTitle ??
      (kind === 'transport' ? '交通转场' : kind === 'note' ? '备注' : null);
    const siblings = await this.c
      .from('trip_items')
      .select('rank')
      .eq('trip_id', input.tripId)
      .eq('day_id', input.dayId ?? null)
      .order('rank');
    const last = siblings.data?.at(-1)?.rank;
    const rank = input.rank ?? (last ? rankBetween(last, null) : initialRank());
    const { data, error } = await this.c
      .from('trip_items')
      .insert({
        trip_id: input.tripId,
        day_id: input.dayId ?? null,
        kind,
        poi_id: input.poiId ?? null,
        custom_title: customTitle,
        transport_mode: kind === 'transport' ? (input.transportMode ?? 'train') : null,
        from_city_id: kind === 'transport' ? (input.fromCityId ?? null) : null,
        to_city_id: kind === 'transport' ? (input.toCityId ?? null) : null,
        images: [],
        rank,
        status: input.status ?? 'candidate',
      })
      .select()
      .single();
    if (error) throw error;
    return mapItem(data);
  }

  async updateItem(id: string, patch: Partial<TripItem>): Promise<TripItem> {
    const row: Record<string, unknown> = {};
    if (patch.dayId !== undefined) row.day_id = patch.dayId;
    if (patch.poiId !== undefined) row.poi_id = patch.poiId;
    if (patch.customTitle !== undefined) row.custom_title = patch.customTitle;
    if (patch.rank !== undefined) row.rank = patch.rank;
    if (patch.slotStart !== undefined) row.slot_start = patch.slotStart;
    if (patch.slotEnd !== undefined) row.slot_end = patch.slotEnd;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.note !== undefined) row.note = patch.note;
    if (patch.images !== undefined) row.images = patch.images;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.transportMode !== undefined) row.transport_mode = patch.transportMode ?? null;
    if (patch.fromCityId !== undefined) row.from_city_id = patch.fromCityId ?? null;
    if (patch.toCityId !== undefined) row.to_city_id = patch.toCityId ?? null;
    const { data, error } = await this.c
      .from('trip_items')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapItem(data);
  }

  async moveItem(id: string, to: { dayId: string | null; rank: string }): Promise<TripItem> {
    return this.updateItem(id, { dayId: to.dayId, rank: to.rank });
  }

  async removeItem(id: string): Promise<void> {
    const { error } = await this.c.from('trip_items').delete().eq('id', id);
    if (error) throw error;
  }

  async addMember(tripId: string, displayName: string): Promise<TripMember> {
    const { data, error } = await this.c
      .from('trip_members')
      .insert({ trip_id: tripId, display_name: displayName, role: 'member', user_id: null })
      .select()
      .single();
    if (error) throw error;
    return mapMember(data);
  }

  async removeMember(id: string): Promise<void> {
    const { error } = await this.c.from('trip_members').delete().eq('id', id);
    if (error) {
      // 外键约束（如该成员是某账单付款人）→ 提示先处理账目
      if (String(error.code) === '23503') {
        throw new Error('该成员已有账本记录，先处理账目再移除');
      }
      throw error;
    }
  }

  // —— 协作邀请（仅云端） ——

  async createInvite(
    tripId: string,
    opts?: { maxUses?: number; expiresInDays?: number; claimMemberId?: string | null },
  ): Promise<TripInvite> {
    const token = randomToken();
    const expiresAt =
      opts?.expiresInDays != null
        ? new Date(Date.now() + opts.expiresInDays * 86400_000).toISOString()
        : null;
    const { data, error } = await this.c
      .from('trip_invites')
      .insert({
        trip_id: tripId,
        token,
        claim_member_id: opts?.claimMemberId ?? null,
        expires_at: expiresAt,
        max_uses: opts?.maxUses ?? 20,
      })
      .select()
      .single();
    if (error) throw error;
    return mapInvite(data);
  }

  async listInvites(tripId: string): Promise<TripInvite[]> {
    const { data, error } = await this.c
      .from('trip_invites')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapInvite);
  }

  async revokeInvite(id: string): Promise<void> {
    const { error } = await this.c.from('trip_invites').delete().eq('id', id);
    if (error) throw error;
  }

  async joinTripByToken(token: string, displayName?: string | null): Promise<void> {
    const { error } = await this.c.rpc('join_trip_by_token', {
      p_token: token,
      p_display_name: displayName ?? null,
    });
    if (error) throw error;
  }

  async vote(itemId: string, memberId: string, value: 1 | -1 | 0): Promise<void> {
    if (value === 0) {
      const { error } = await this.c
        .from('item_votes')
        .delete()
        .eq('item_id', itemId)
        .eq('member_id', memberId);
      if (error) throw error;
      return;
    }
    const { data: item, error: ie } = await this.c
      .from('trip_items')
      .select('trip_id')
      .eq('id', itemId)
      .single();
    if (ie) throw ie;
    const { error } = await this.c.from('item_votes').upsert(
      { item_id: itemId, member_id: memberId, trip_id: item.trip_id, value },
      { onConflict: 'item_id,member_id' },
    );
    if (error) throw error;
  }

  async upsertTicket(input: Omit<Ticket, 'id'> & { id?: string }): Promise<Ticket> {
    const row: Record<string, unknown> = {
      trip_id: input.tripId,
      item_id: input.itemId ?? null,
      title: input.title,
      channel: input.channel ?? null,
      official_url: input.officialUrl ?? null,
      price_cents: input.priceCents ?? null,
      currency: input.currency ?? null,
      time_slot: input.timeSlot ?? null,
      booking_ref: input.bookingRef ?? null,
      booked: input.booked,
      lead_days: input.leadDays ?? null,
      note: input.note ?? null,
    };
    if (input.id) {
      const { data, error } = await this.c
        .from('tickets')
        .update(row)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return mapTicket(data);
    }
    const { data, error } = await this.c.from('tickets').insert(row).select().single();
    if (error) throw error;
    return mapTicket(data);
  }

  async removeTicket(id: string): Promise<void> {
    const { error } = await this.c.from('tickets').delete().eq('id', id);
    if (error) throw error;
  }

  async upsertExpense(input: Omit<Expense, 'id'> & { id?: string }): Promise<Expense> {
    const row: Record<string, unknown> = {
      trip_id: input.tripId,
      day_id: input.dayId ?? null,
      item_id: input.itemId ?? null,
      category: input.category,
      title: input.title,
      amount_cents: input.amountCents,
      currency: input.currency,
      fx_rate: input.fxRate,
      payer_member_id: input.payerMemberId,
      spent_at: input.spentAt,
      note: input.note ?? null,
      split_mode: input.splitMode,
    };

    let expenseId: string;
    if (input.id) {
      expenseId = input.id;
      const { error } = await this.c.from('expenses').update(row).eq('id', input.id);
      if (error) throw error;
    } else {
      const { data, error } = await this.c.from('expenses').insert(row).select('id').single();
      if (error) throw error;
      expenseId = data.id;
    }

    // 分摊份额：先清后写（expense_shares 无 upsert 唯一键，简单处理）
    const { error: delErr } = await this.c
      .from('expense_shares')
      .delete()
      .eq('expense_id', expenseId);
    if (delErr) throw delErr;
    const shares = (input.shares ?? []).map((s) => ({
      expense_id: expenseId,
      member_id: s.memberId,
      trip_id: input.tripId,
      weight: s.weight,
    }));
    if (shares.length) {
      const { error } = await this.c.from('expense_shares').insert(shares);
      if (error) throw error;
    }

    return { ...input, id: expenseId, shares: input.shares ?? [] };
  }

  async removeExpense(id: string): Promise<void> {
    const { error } = await this.c.from('expenses').delete().eq('id', id);
    if (error) throw error;
  }
}

/** 生成 URL 安全的随机令牌（base62，~32 字符） */
function randomToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function mapInvite(r: Record<string, unknown>): TripInvite {
  return {
    id: String(r.id),
    tripId: String(r.trip_id),
    token: String(r.token),
    claimMemberId: (r.claim_member_id as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    maxUses: Number(r.max_uses ?? 0),
    usedCount: Number(r.used_count ?? 0),
    createdAt: String(r.created_at),
  };
}
