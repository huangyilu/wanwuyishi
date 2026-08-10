-- 0006 · 图片附件对象存储（Supabase Storage）
--
-- 在 Supabase 控制台 → SQL Editor 执行。本机无 CLI，无法脚本代跑。
-- 设计取舍（零成本 + MVP 先跑通）：bucket 设为 public 只读，写入仅限
-- 已登录用户（含匿名登录，其角色也是 authenticated）。对象 key 形如
--   trip-attachments/{tripId}/{itemId}/{timestamp}-{filename}
-- 其中 tripId/itemId 均为随机 UUID，他人难以猜中，故未再做按行程成员的
-- 细粒度校验——避免 regexp 解析路径在不同 Supabase 版本的兼容坑。
-- 若日后要收紧，可把 insert/delete 的 with check / using 换成
--   exists (select 1 from trip_members tm
--           where tm.trip_id = (regexp_match(name, '^([0-9a-f-]{36})/'))[1]::uuid
--             and tm.user_id = auth.uid())

-- 1) 建 bucket（公开读；单文件上限 5MB，仅放行图片类型）
-- 动态探测 storage.buckets 是否支持 file_size_limit / allowed_mime_types 列，
-- 仅写入存在的列，兼容不同 Supabase 版本的 schema（老版本无这两列会报 column 错）。
do $$
declare
  v_has_size boolean;
  v_has_mime boolean;
  v_sql      text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) into v_has_size;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) into v_has_mime;

  if not exists (select 1 from storage.buckets where id = 'trip-attachments') then
    v_sql := 'insert into storage.buckets (id, name, public';
    if v_has_size then v_sql := v_sql || ', file_size_limit'; end if;
    if v_has_mime then v_sql := v_sql || ', allowed_mime_types'; end if;
    v_sql := v_sql || ') values (''trip-attachments'', ''trip-attachments'', true';
    if v_has_size then v_sql := v_sql || ', 5242880'; end if;
    if v_has_mime then v_sql := v_sql || ', ''{image/png,image/jpeg,image/webp,image/gif}'''; end if;
    v_sql := v_sql || ')';
    execute v_sql;
  end if;
end $$;

-- 2) 公开读：任何人都可读取附件（行程共享内容，本就可见）
drop policy if exists "attachments_select" on storage.objects;
create policy "attachments_select" on storage.objects
  for select using (bucket_id = 'trip-attachments');

-- 3) 已登录用户可上传
drop policy if exists "attachments_insert" on storage.objects;
create policy "attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trip-attachments');

-- 4) 已登录用户可删除
drop policy if exists "attachments_delete" on storage.objects;
create policy "attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-attachments');
