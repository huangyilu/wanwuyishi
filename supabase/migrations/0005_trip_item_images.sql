-- 0005 · 行程条目的图片附件 URL 数组
--
-- 仅云端档（Supabase Storage）使用：文件本体存在 trip-attachments bucket，
-- 这里只存可直链的公开 URL 数组。本地档（localStorage）不开放上传，
-- 但保留列以兼容从云端导出的快照。
--
-- 注意：本机没有 supabase CLI / service_role key，以下 SQL 需手动在
-- Supabase 控制台 → SQL Editor 执行（不是 git push 自动跑）。

alter table trip_items
  add column images text[] not null default '{}';
