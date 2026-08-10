-- =====================================================================
-- 玩无一失 · 迁移 0002
-- 目标：trip_items 支持「交通转场 / 备注」两类自定义条目，
--       让转场日（只有坐车坐飞机、没有景点）也能串进时间线。
-- 说明：在 0001 之后执行。幂等，可重复粘贴。
--       时间线以 trip_items.kind 为单一来源；
--       0001 里独立的 transports 表保留作未来签证明细镜像，本迁移不动它。
-- 参考文档：docs/技术方案.md 第 4 章 trip_items
-- =====================================================================

-- 1. 新增列（kind 默认 'poi'，兼容旧数据；transport_mode 复用 0001 已建的枚举）
alter table public.trip_items add column if not exists kind          text not null default 'poi';
alter table public.trip_items add column if not exists transport_mode transport_mode;
alter table public.trip_items add column if not exists from_city_id  text;
alter table public.trip_items add column if not exists to_city_id    text;

-- 2. 兜底：把任何历史 null 行修成 'poi'（理论上 0001 之后新建的行都带值）
update public.trip_items set kind = 'poi' where kind is null or kind = '';

-- 3. 无脑跟随：克隆时一并复制 kind 与交通字段（其余约束同 0001）
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
      -- 只复制 POI 引用、交通字段、时段与顺序；票券/账本/个人笔记一律不复制；状态重置为候选
      insert into public.trip_items (trip_id, day_id, poi_id, custom_title, kind,
                                     transport_mode, from_city_id, to_city_id,
                                     rank, slot_start, slot_end, status, created_by)
      values (v_new_trip_id, v_day_id,
              v_item->>'poiId', v_item->>'customTitle', coalesce(v_item->>'kind','poi'),
              nullif(v_item->>'transportMode','')::transport_mode,
              nullif(v_item->>'fromCityId',''), nullif(v_item->>'toCityId',''),
              coalesce(v_item->>'rank','a0'),
              nullif(v_item->>'slotStart','')::time,
              nullif(v_item->>'slotEnd','')::time,
              'candidate', auth.uid());
    end loop;
  end loop;

  return v_new_trip_id;
end $$;

grant execute on function public.clone_trip_from_share(text, date, text) to authenticated;

-- 4. 索引：按 kind 过滤交通段（签证行程单 / 时间线分色可能用到）
create index if not exists idx_trip_items_kind on public.trip_items(kind);

-- =====================================================================
-- 完
-- =====================================================================
