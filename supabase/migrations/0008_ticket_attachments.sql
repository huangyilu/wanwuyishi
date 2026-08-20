-- 0008 · 门票 PDF 附件
--
-- tickets 表新增 attachments jsonb 列，存储 PDF 附件元数据数组。
-- 每个元素形如 { url, name, size, uploadedAt }，文件本体存 Supabase Storage
-- 的 trip-attachments bucket（路径 {tripId}/tickets/{ticketId}/...）。
--
-- 注意：本机没有 supabase CLI / service_role key，以下 SQL 需手动在
-- Supabase 控制台 → SQL Editor 执行（不是 git push 自动跑）。

-- 1) tickets 表新增 attachments 列
alter table tickets
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 2) 更新 trip-attachments bucket：允许 PDF + 大小提到 10MB
--    （bucket 已存在但当初只允许图片 MIME，需补 application/pdf）
update storage.buckets
  set allowed_mime_types = '{image/png,image/jpeg,image/webp,image/gif,application/pdf}',
      file_size_limit    = 10485760
  where id = 'trip-attachments';
