/**
 * 数据层的类型与 Repository 接口。
 *
 * 世界库类型来自 domain/world/schema（zod 推导），行程类型在这里定义，
 * 字段名与 supabase/migrations/0001_init.sql 的列一一对应（camelCase ↔ snake_case），
 * 这样 M6 换 adapter 时视图层零改动。
 */
import type { City, Country, Poi } from '../domain/world/schema';

/* ---------------------------------- 世界库 ---------------------------------- */

export interface PoiSummary {
  id: string;
  type: Poi['type'];
  name: string;
  localName: string;
  city: string;
  country: string;
  location: { lat: number; lng: number };
  tags: string[];
  popularity: number;
  closedWeekdays: number[];
  hasGuide: boolean;
  durationMinutes: [number, number];
  bookingLeadDays: number | null;
}

export interface CitySummary {
  id: string;
  name: string;
  localName: string;
  country: string;
  location: { lat: number; lng: number };
  poiCount: number;
  hasSurvival: boolean;
}

export interface CountrySummary {
  id: string;
  name: string;
  localName: string;
  currency: string;
  hasVisa: boolean;
}

export interface WorldIndex {
  generatedAt: string;
  countries: CountrySummary[];
  cities: CitySummary[];
  pois: PoiSummary[];
}

export interface PoiQuery {
  cityId?: string;
  types?: Array<Poi['type']>;
  tags?: string[];
  excludeTags?: string[];
  keyword?: string;
  sort?: 'popularity' | 'name';
}

export interface SearchHit {
  id: string;
  kind: 'city' | 'poi';
  name: string;
  subtitle: string;
}

export interface WorldRepository {
  getIndex(): Promise<WorldIndex>;
  listCountries(): Promise<CountrySummary[]>;
  getCountry(id: string): Promise<Country | null>;
  listCities(countryId?: string): Promise<CitySummary[]>;
  getCity(id: string): Promise<City | null>;
  listPois(q?: PoiQuery): Promise<PoiSummary[]>;
  getPoi(id: string): Promise<Poi | null>;
  getPois(ids: string[]): Promise<Record<string, Poi>>;
  search(keyword: string): Promise<SearchHit[]>;
}

/* ---------------------------------- 行程层 ---------------------------------- */

export type ItemStatus = 'wishlist' | 'candidate' | 'confirmed' | 'visited' | 'dropped';
export type MemberRole = 'owner' | 'member';
export type TripStatus = 'planning' | 'ongoing' | 'finished' | 'archived';
export type ExpenseCategory = 'ticket' | 'transport' | 'food' | 'stay' | 'shopping' | 'other';
/** 一笔账的归属：'aa' = 需要大家分摊；'personal' = 个人自付，不计入 AA 结算 */
export type ExpenseSplitMode = 'aa' | 'personal';

/** 时间线条目的种类：景点 / 交通 / 住宿 / 纯备注。交通、住宿与备注让转场日也能串进时间线。 */
export type ItemKind = 'poi' | 'transport' | 'note' | 'accommodation';
/** 与 supabase 迁移里的 transport_mode 枚举一致 */
export type TransportMode = 'train' | 'flight' | 'bus' | 'ferry' | 'car' | 'walk' | 'other';

/** 打包清单的一项。列表存在 Trip.packing 上，随行程一起读写。 */
export interface PackingItem {
  id: string;
  /** 分类：证件/票据 · 衣物 · 洗漱 · 电子 · 药品 · 其他 */
  category: string;
  text: string;
  done: boolean;
  /**
   * 归属成员 id：这条行李是谁的。
   * - 有值：个人行李，只有该成员自己勾选 / 看到（在自己的视角里）
   * - null：公共共享项，只需准备一份（如转换插头），由 assigneeId 指定谁带
   */
  ownerId: string | null;
  /** 负责人（仅公共项有意义）：谁带这件公共物品；null = 未指定 */
  assigneeId: string | null;
  note: string | null;
}

export interface Trip {
  id: string;
  ownerId: string | null;
  title: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
  preferences: { excludeTags?: string[] };
  sourceTripId?: string | null;
  sourceLabel?: string | null;
  status: TripStatus;
  /** 打包清单：智能生成 + 手动增删，离线优先存在本行程上 */
  packing: PackingItem[];
  updatedAt: string;
}

export interface TripMember {
  id: string;
  tripId: string;
  /** null 即幽灵成员：只有名字，没有账号，但可被投票、被记账、被结算 */
  userId: string | null;
  displayName: string;
  role: MemberRole;
  color?: string | null;
}

export interface TripInvite {
  id: string;
  tripId: string;
  token: string;
  /** 定向认领某个幽灵成员（把朋友账号绑到已有占位名）；null 即普通邀请 */
  claimMemberId: string | null;
  expiresAt: string | null;
  maxUses: number;
  usedCount: number;
  createdAt: string;
}

export interface TripDay {
  id: string;
  tripId: string;
  date: string;
  cityId: string | null;
  note: string | null;
}

export interface TripItem {
  id: string;
  tripId: string;
  /** null = 还在候选池，没有落到具体某天 */
  dayId: string | null;
  /** 条目种类；旧数据缺省按 'poi' 处理 */
  kind: ItemKind;
  poiId: string | null;
  customTitle: string | null;
  /** kind==='transport' 时有效：交通方式 */
  transportMode?: TransportMode | null;
  /** kind==='transport' 时有效：出发 / 到达城市（世界库引用，如 city-paris） */
  fromCityId?: string | null;
  toCityId?: string | null;
  rank: string;
  slotStart: string | null;
  slotEnd: string | null;
  status: ItemStatus;
  note: string | null;
  /** kind==='accommodation' 时有效：酒店/住宿详细地址，支持单独复制 */
  address: string | null;
  /**
   * 图片附件的公开 URL 数组（仅云端档使用）。
   * 文件存 Supabase Storage 的 trip-attachments bucket，这里只存可直链的 URL。
   * 本地档（localStorage）不开放上传，但保留该字段以兼容从云端导出的快照。
   */
  images?: string[] | null;
  updatedAt: string;
}

export interface ItemVote {
  itemId: string;
  memberId: string;
  value: 1 | -1;
}

export interface Ticket {
  id: string;
  tripId: string;
  itemId: string | null;
  title: string;
  channel: string | null;
  officialUrl: string | null;
  priceCents: number | null;
  currency: string | null;
  timeSlot: string | null;
  /** 确认号：绝不进分享快照 */
  bookingRef: string | null;
  booked: boolean;
  leadDays: number | null;
  note: string | null;
}

export interface Expense {
  id: string;
  tripId: string;
  dayId: string | null;
  itemId: string | null;
  category: ExpenseCategory;
  title: string;
  amountCents: number;
  currency: string;
  fxRate: number;
  payerMemberId: string;
  spentAt: string;
  note: string | null;
  /** 'aa' = 共同分摊（默认）；'personal' = 个人自付，不影响谁欠谁 */
  splitMode: ExpenseSplitMode;
  shares: Array<{ memberId: string; weight: number }>;
}

/** 行程页一次性拿全，避免 6 次往返 */
export interface TripBundle {
  trip: Trip;
  members: TripMember[];
  days: TripDay[];
  items: TripItem[];
  votes: ItemVote[];
  tickets: Ticket[];
  expenses: Expense[];
}

export interface CreateTripInput {
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  baseCurrency?: string;
}

export interface AddItemInput {
  tripId: string;
  dayId: string | null;
  poiId?: string | null;
  customTitle?: string | null;
  /** 不传默认 'poi'（兼容旧调用方只加景点） */
  kind?: ItemKind;
  transportMode?: TransportMode | null;
  fromCityId?: string | null;
  toCityId?: string | null;
  status?: ItemStatus;
  /** 不传则追加到末尾 */
  rank?: string;
}

export interface TripRepository {
  readonly kind: 'local' | 'supabase' | 'snapshot' | 'mock';
  /** 离线快照 adapter 返回 false，UI 据此统一禁用编辑入口 */
  readonly capabilities: { canWrite: boolean; canSync: boolean };

  listTrips(): Promise<Trip[]>;
  getBundle(tripId: string): Promise<TripBundle | null>;
  createTrip(input: CreateTripInput): Promise<Trip>;
  updateTrip(id: string, patch: Partial<Trip>): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;

  addDay(tripId: string, date: string, cityId?: string | null): Promise<TripDay>;
  updateDay(id: string, patch: Partial<TripDay>): Promise<TripDay>;
  removeDay(id: string): Promise<void>;

  addItem(input: AddItemInput): Promise<TripItem>;
  updateItem(id: string, patch: Partial<TripItem>): Promise<TripItem>;
  moveItem(id: string, to: { dayId: string | null; rank: string }): Promise<TripItem>;
  removeItem(id: string): Promise<void>;

  addMember(tripId: string, displayName: string): Promise<TripMember>;
  removeMember(id: string): Promise<void>;

  /** 协作邀请（仅云端支持）：owner 生成/查看/撤销邀请，朋友凭 token 加入 */
  createInvite(tripId: string, opts?: { maxUses?: number; expiresInDays?: number; claimMemberId?: string | null }): Promise<TripInvite>;
  listInvites(tripId: string): Promise<TripInvite[]>;
  revokeInvite(id: string): Promise<void>;
  joinTripByToken(token: string, displayName?: string | null): Promise<void>;

  vote(itemId: string, memberId: string, value: 1 | -1 | 0): Promise<void>;

  upsertTicket(input: Omit<Ticket, 'id'> & { id?: string }): Promise<Ticket>;
  removeTicket(id: string): Promise<void>;

  upsertExpense(input: Omit<Expense, 'id'> & { id?: string }): Promise<Expense>;
  removeExpense(id: string): Promise<void>;
}
