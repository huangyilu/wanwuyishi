-- ============================================================================
-- 玩无一失 · 行程附件（图片 + PDF）· 一键应用脚本
-- ============================================================================
-- 用法：复制本文件全部内容 → Supabase 控制台 → SQL Editor → Run
-- 本机无 supabase CLI / service_role key，迁移不会自动执行，需手动跑这一段。
-- 已做成幂等：重复执行不会报错（加列有 if-not-exists 保护，bucket /
-- policy 有 on conflict / drop if exists 保护）。
--
-- 作用：
--   1) trip_items 增加 images text[] 列（存 Storage 公开 URL 数组）
--   2) 建 trip-attachments 公开 bucket（单文件 10MB，图片 + PDF）
--   3) 设 storage.objects 的 读/写/删 RLS（仅已登录用户可写）
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) 行程条目图片 URL 数组列（幂等）
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'trip_items' and column_name = 'images'
  ) then
    alter table trip_items add column images text[] not null default '{}';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) 图片附件对象存储 bucket（幂等）
-- ---------------------------------------------------------------------------
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
    if v_has_size then v_sql := v_sql || ', 10485760'; end if;
    if v_has_mime then v_sql := v_sql || ', ''{image/png,image/jpeg,image/webp,image/gif,application/pdf}'''; end if;
    v_sql := v_sql || ')';
    execute v_sql;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Storage RLS：公开读 + 登录用户可上传/删除（幂等）
-- ---------------------------------------------------------------------------
-- 3a) 公开读：行程共享内容本就可见，任何人都可读
drop policy if exists "attachments_select" on storage.objects;
create policy "attachments_select" on storage.objects
  for select using (bucket_id = 'trip-attachments');

-- 3b) 已登录用户可上传（含匿名登录，其角色也是 authenticated）
drop policy if exists "attachments_insert" on storage.objects;
create policy "attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trip-attachments');

-- 3c) 已登录用户可删除
drop policy if exists "attachments_delete" on storage.objects;
create policy "attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-attachments');

-- ---------------------------------------------------------------------------
-- 完成 ✅  回到 App 刷新即可使用图片上传（仅云端档 / 登录后）
-- ---------------------------------------------------------------------------
