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
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-attachments',
  'trip-attachments',
  true,
  5242880,
  '{image/png,image/jpeg,image/webp,image/gif}'
)
on conflict (id) do nothing;

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
