-- =====================================================================
-- 玩无一失 · 初始化迁移 0001
-- 目标：用户 / 行程 / 协作 / 账本 / 分享 的完整表结构与 RLS
-- 说明：可直接粘贴进 Supabase SQL Editor 执行（幂等性：请在空库执行一次）
-- 参考文档：docs/技术方案.md 第 4、6 章
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. 枚举
-- ---------------------------------------------------------------------
do $$ begin
  create type trip_status       as enum ('planning','ongoing','finished','archived');
  create type member_role       as enum ('owner','member');
  create type item_status       as enum ('wishlist','candidate','confirmed','visited','dropped');
  create type expense_category  as enum ('ticket','transport','food','stay','shopping','other');
  create type transport_mode    as enum ('train','flight','bus','ferry','car','walk','other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. profiles —— auth.users 的公开扩展
--    注意：profiles 仅本人可读写。同伴展示名冗余在 trip_members.display_name
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '旅行者',
  avatar_url   text,
  preferences  jsonb not null default '{}'::jsonb,   -- { excludeTags, pace, interests }
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1), '旅行者'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. trips
-- ---------------------------------------------------------------------
create table if not exists public.trips (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  title          text not null,
  start_date     date,
  end_date       date,
  base_currency  char(3) not null default 'CNY',
  preferences    jsonb not null default '{}'::jsonb,  -- { excludeTags: [...] }
  source_trip_id uuid references public.trips(id) on delete set null, -- 无脑跟随来源
  source_label   text,                                -- "跟随自《XX 的法意瑞 12 天》"
  status         trip_status not null default 'planning',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_trips_owner on public.trips(owner_id);

-- ---------------------------------------------------------------------
-- 3. trip_members —— 投票 / 账本的唯一主体；user_id 为 NULL 即幽灵成员
-- ---------------------------------------------------------------------
create table if not exists public.trip_members (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null, -- 注销后退化为幽灵，历史保留
  display_name text not null,
  role         member_role not null default 'member',
  color        text,
  created_at   timestamptz not null default now()
);
create unique index if not exists uq_trip_members_user
  on public.trip_members(trip_id, user_id) where user_id is not null;
create index if not exists idx_trip_members_trip on public.trip_members(trip_id);

-- 创建行程后自动把 owner 加为成员（否则 owner 读不到自己刚建的行程）
create or replace function public.on_trip_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_members (trip_id, user_id, display_name, role)
  select new.id, new.owner_id, coalesce(p.display_name, '我'), 'owner'
    from public.profiles p where p.id = new.owner_id;
  return new;
end $$;

drop trigger if exists trg_trip_created on public.trips;
create trigger trg_trip_created after insert on public.trips
  for each row execute function public.on_trip_created();

-- ---------------------------------------------------------------------
-- 4. trip_days / trip_items / item_votes
-- ---------------------------------------------------------------------
create table if not exists public.trip_days (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null references public.trips(id) on delete cascade,
  date     date not null,
  city_id  text,                      -- 世界库引用，如 city-paris
  note     text,
  unique (trip_id, date)
);
create index if not exists idx_trip_days_trip on public.trip_days(trip_id);

create table if not exists public.trip_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  day_id       uuid references public.trip_days(id) on delete set null, -- NULL = 候选池
  poi_id       text,                  -- 世界库引用
  custom_title text,                  -- 世界库没有的自定义条目
  rank         text not null,         -- fractional index，见 domain/trip/rank.ts
  slot_start   time,
  slot_end     time,
  status       item_status not null default 'candidate',
  note         text,                  -- 共享笔记（个人笔记见 personal_notes）
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint item_has_target check (poi_id is not null or custom_title is not null)
);
create index if not exists idx_trip_items_trip on public.trip_items(trip_id);
create index if not exists idx_trip_items_day  on public.trip_items(day_id, rank);

create table if not exists public.item_votes (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  item_id    uuid not null references public.trip_items(id) on delete cascade,
  member_id  uuid not null references public.trip_members(id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (item_id, member_id)
);
create index if not exists idx_item_votes_trip on public.item_votes(trip_id);

-- ---------------------------------------------------------------------
-- 5. tickets —— 票券；booking_ref 属半敏感，分享时无条件抹除
-- ---------------------------------------------------------------------
create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  item_id      uuid references public.trip_items(id) on delete set null,
  title        text not null,
  channel      text,                      -- 官网 / 携程 / KKday ...
  official_url text,
  price_cents  bigint check (price_cents >= 0),
  currency     char(3),
  time_slot    text,                      -- "09:00" 或 "09:00-11:00"
  booking_ref  text,                      -- 确认号：绝不进分享快照
  booked       boolean not null default false,
  lead_days    integer,                   -- 建议提前 N 天预约（默认取自 POI，可覆盖）
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_tickets_trip on public.tickets(trip_id);

-- ---------------------------------------------------------------------
-- 6. expenses / expense_shares —— 金额一律整数分
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  day_id          uuid references public.trip_days(id) on delete set null,
  item_id         uuid references public.trip_items(id) on delete set null,
  category        expense_category not null default 'other',
  title           text not null,
  amount_cents    bigint not null check (amount_cents > 0),
  currency        char(3) not null,
  fx_rate         numeric(12,6) not null default 1,  -- 换算到 trips.base_currency
  payer_member_id uuid not null references public.trip_members(id) on delete restrict,
  spent_at        timestamptz not null default now(),
  note            text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_expenses_trip on public.expenses(trip_id);

create table if not exists public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id  uuid not null references public.trip_members(id) on delete cascade,
  trip_id    uuid not null references public.trips(id) on delete cascade, -- 冗余，供 RLS
  weight     numeric(8,3) not null default 1 check (weight > 0),
  primary key (expense_id, member_id)
);
create index if not exists idx_expense_shares_trip on public.expense_shares(trip_id);

-- ---------------------------------------------------------------------
-- 7. transports / accommodations —— P1，签证行程单依赖这两张表
-- ---------------------------------------------------------------------
create table if not exists public.transports (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  from_city_id text,
  to_city_id   text,
  mode         transport_mode not null default 'train',
  depart_at    timestamptz,
  arrive_at    timestamptz,
  carrier      text,
  booking_ref  text,                      -- 同样不进分享快照
  price_cents  bigint,
  currency     char(3),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_transports_trip on public.transports(trip_id);

create table if not exists public.accommodations (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  city_id     text,
  name        text not null,
  address     text,                       -- 签证行程单必填项
  check_in    date not null,
  check_out   date not null,
  booking_ref text,
  price_cents bigint,
  currency    char(3),
  url         text,
  area        text,                       -- 区域（隐藏酒店名时展示这个）
  note        text,
  created_at  timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists idx_accommodations_trip on public.accommodations(trip_id);

-- ---------------------------------------------------------------------
-- 8. personal_notes —— 个人数据，成员之间互不可见，永不进分享快照
-- ---------------------------------------------------------------------
create table if not exists public.personal_notes (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  item_id    uuid references public.trip_items(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_personal_notes_user on public.personal_notes(user_id, trip_id);

-- ---------------------------------------------------------------------
-- 9. trip_invites / shares
-- ---------------------------------------------------------------------
create table if not exists public.trip_invites (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  token           text not null unique,
  claim_member_id uuid references public.trip_members(id) on delete set null, -- 定向认领幽灵成员
  expires_at      timestamptz,
  max_uses        integer not null default 20,
  used_count      integer not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.shares (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  slug         text not null unique,          -- base62(22)，不可枚举
  scope        jsonb not null default '{}'::jsonb,
  payload      jsonb not null,                -- 已隐私净化的发布快照
  version      integer not null default 1,
  published_at timestamptz not null default now(),
  revoked_at   timestamptz
);

-- ---------------------------------------------------------------------
-- 10. updated_at 自动维护
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','trips','trip_items','tickets'] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- =====================================================================
-- 11. 权限判定函数（SECURITY DEFINER，避免 RLS 递归）
-- =====================================================================
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.trip_members m
     where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.trips t
     where t.id = p_trip_id and t.owner_id = auth.uid()
  );
$$;

-- =====================================================================
-- 12. RLS
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_members    enable row level security;
alter table public.trip_days       enable row level security;
alter table public.trip_items      enable row level security;
alter table public.item_votes      enable row level security;
alter table public.tickets         enable row level security;
alter table public.expenses        enable row level security;
alter table public.expense_shares  enable row level security;
alter table public.transports      enable row level security;
alter table public.accommodations  enable row level security;
alter table public.personal_notes  enable row level security;
alter table public.trip_invites    enable row level security;
alter table public.shares          enable row level security;

-- profiles：仅本人
drop policy if exists p_profiles_self on public.profiles;
create policy p_profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- trips
drop policy if exists p_trips_read on public.trips;
create policy p_trips_read on public.trips
  for select using (public.is_trip_member(id) or owner_id = auth.uid());

drop policy if exists p_trips_insert on public.trips;
create policy p_trips_insert on public.trips
  for insert with check (owner_id = auth.uid());

drop policy if exists p_trips_update on public.trips;
create policy p_trips_update on public.trips
  for update using (public.is_trip_member(id)) with check (public.is_trip_member(id));

drop policy if exists p_trips_delete on public.trips;
create policy p_trips_delete on public.trips
  for delete using (owner_id = auth.uid());

-- trip_members：成员可读，仅 owner 可增删改（加入房间走 RPC）
drop policy if exists p_members_read on public.trip_members;
create policy p_members_read on public.trip_members
  for select using (public.is_trip_member(trip_id) or public.is_trip_owner(trip_id));

drop policy if exists p_members_write on public.trip_members;
create policy p_members_write on public.trip_members
  for all using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));

-- 行程子表：统一模板
do $$
declare t text;
begin
  foreach t in array array[
    'trip_days','trip_items','item_votes','tickets',
    'expenses','expense_shares','transports','accommodations'
  ] loop
    execute format('drop policy if exists p_%1$s_member on public.%1$s;', t);
    execute format(
      'create policy p_%1$s_member on public.%1$s
         for all using (public.is_trip_member(trip_id))
         with check (public.is_trip_member(trip_id));', t);
  end loop;
end $$;

-- personal_notes：仅本人（且必须是该行程成员）
drop policy if exists p_personal_notes_self on public.personal_notes;
create policy p_personal_notes_self on public.personal_notes
  for all using (user_id = auth.uid() and public.is_trip_member(trip_id))
       with check (user_id = auth.uid() and public.is_trip_member(trip_id));

-- trip_invites：成员可读可建，匿名不可读（使用走 RPC）
drop policy if exists p_invites_member on public.trip_invites;
create policy p_invites_member on public.trip_invites
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- shares：仅 owner 管理。匿名读取唯一入口是 get_share() RPC
-- （切勿给 anon 加 select 策略，否则可 GET /rest/v1/shares 枚举全部分享）
drop policy if exists p_shares_owner on public.shares;
create policy p_shares_owner on public.shares
  for all using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));

-- =====================================================================
-- 13. RPC
-- =====================================================================

-- 13.1 一次性取回行程全量数据（减少往返）
create or replace function public.get_trip_bundle(p_trip_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare result jsonb;
begin
  if not public.is_trip_member(p_trip_id) then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'trip',           (select to_jsonb(t) from public.trips t where t.id = p_trip_id),
    'members',        coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at)
                                  from public.trip_members m where m.trip_id = p_trip_id), '[]'::jsonb),
    'days',           coalesce((select jsonb_agg(to_jsonb(d) order by d.date)
                                  from public.trip_days d where d.trip_id = p_trip_id), '[]'::jsonb),
    'items',          coalesce((select jsonb_agg(to_jsonb(i) order by i.rank)
                                  from public.trip_items i where i.trip_id = p_trip_id), '[]'::jsonb),
    'votes',          coalesce((select jsonb_agg(to_jsonb(v))
                                  from public.item_votes v where v.trip_id = p_trip_id), '[]'::jsonb),
    'tickets',        coalesce((select jsonb_agg(to_jsonb(k))
                                  from public.tickets k where k.trip_id = p_trip_id), '[]'::jsonb),
    'expenses',       coalesce((select jsonb_agg(to_jsonb(e) order by e.spent_at)
                                  from public.expenses e where e.trip_id = p_trip_id), '[]'::jsonb),
    'expenseShares',  coalesce((select jsonb_agg(to_jsonb(s))
                                  from public.expense_shares s where s.trip_id = p_trip_id), '[]'::jsonb),
    'transports',     coalesce((select jsonb_agg(to_jsonb(tr) order by tr.depart_at)
                                  from public.transports tr where tr.trip_id = p_trip_id), '[]'::jsonb),
    'accommodations', coalesce((select jsonb_agg(to_jsonb(a) order by a.check_in)
                                  from public.accommodations a where a.trip_id = p_trip_id), '[]'::jsonb),
    'myNotes',        coalesce((select jsonb_agg(to_jsonb(n))
                                  from public.personal_notes n
                                 where n.trip_id = p_trip_id and n.user_id = auth.uid()), '[]'::jsonb)
  ) into result;

  return result;
end $$;

grant execute on function public.get_trip_bundle(uuid) to authenticated;

-- 13.2 凭邀请 token 加入行程（支持认领幽灵成员，继承其全部历史）
create or replace function public.join_trip_by_token(p_token text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_invite public.trip_invites; v_member_id uuid;
begin
  select * into v_invite from public.trip_invites
   where token = p_token
     and (expires_at is null or expires_at > now())
     and used_count < max_uses;
  if not found then raise exception 'INVALID_INVITE'; end if;

  select id into v_member_id from public.trip_members
   where trip_id = v_invite.trip_id and user_id = auth.uid();
  if found then return v_member_id; end if;   -- 幂等

  if v_invite.claim_member_id is not null then
    update public.trip_members
       set user_id = auth.uid(),
           display_name = coalesce(p_display_name, display_name)
     where id = v_invite.claim_member_id and user_id is null
    returning id into v_member_id;
  end if;

  if v_member_id is null then
    insert into public.trip_members (trip_id, user_id, display_name, role)
    values (v_invite.trip_id, auth.uid(), coalesce(p_display_name, '旅伴'), 'member')
    returning id into v_member_id;
  end if;

  update public.trip_invites set used_count = used_count + 1 where id = v_invite.id;
  return v_member_id;
end $$;

revoke all on function public.join_trip_by_token(text, text) from public;
grant execute on function public.join_trip_by_token(text, text) to authenticated;

-- 13.3 匿名按 slug 读取分享快照（精确匹配，不可枚举）
create or replace function public.get_share(p_slug text)
returns jsonb language sql security definer stable set search_path = public as $$
  select s.payload from public.shares s
   where s.slug = p_slug and s.revoked_at is null;
$$;

grant execute on function public.get_share(text) to anon, authenticated;

-- 13.4 无脑跟随：从分享快照克隆为自己的草稿行程（服务端事务内完成）
create or replace function public.clone_trip_from_share(
  p_slug text, p_start_date date, p_title text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb; v_src_trip_id uuid; v_new_trip_id uuid;
  v_offset integer; v_day jsonb; v_item jsonb; v_day_id uuid; v_first_date date;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select payload, trip_id into v_payload, v_src_trip_id
    from public.shares where slug = p_slug and revoked_at is null;
  if v_payload is null then raise exception 'SHARE_NOT_FOUND'; end if;

  v_first_date := (v_payload->'days'->0->>'date')::date;
  v_offset := p_start_date - v_first_date;

  insert into public.trips (owner_id, title, start_date, source_trip_id, source_label)
  values (auth.uid(),
          coalesce(p_title, (v_payload->'trip'->>'title') || '（跟随）'),
          p_start_date, v_src_trip_id, v_payload->'trip'->>'title')
  returning id into v_new_trip_id;

  for v_day in select * from jsonb_array_elements(v_payload->'days') loop
    insert into public.trip_days (trip_id, date, city_id)
    values (v_new_trip_id, ((v_day->>'date')::date + v_offset), v_day->>'cityId')
    returning id into v_day_id;

    for v_item in select * from jsonb_array_elements(coalesce(v_day->'items','[]'::jsonb)) loop
      -- 只复制 POI 引用、时段与顺序；票券/账本/个人笔记一律不复制；状态重置为候选
      insert into public.trip_items (trip_id, day_id, poi_id, custom_title, rank,
                                     slot_start, slot_end, status, created_by)
      values (v_new_trip_id, v_day_id,
              v_item->>'poiId', v_item->>'customTitle',
              coalesce(v_item->>'rank','a0'),
              nullif(v_item->>'slotStart','')::time,
              nullif(v_item->>'slotEnd','')::time,
              'candidate', auth.uid());
    end loop;
  end loop;

  return v_new_trip_id;
end $$;

grant execute on function public.clone_trip_from_share(text, date, text) to authenticated;

-- 13.5 保活（免费档闲置约 7 天会暂停，由 GitHub Actions 定时调用）
create or replace function public.ping()
returns text language sql stable as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon;

-- =====================================================================
-- 完
-- =====================================================================
