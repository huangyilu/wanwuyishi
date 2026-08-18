-- 0007 · 行程条目（住宿）独立「地址」字段
--
-- 把住宿的「详细地址」从 note（预订信息）里拆出来，单独成列，
-- 这样行程卡片 / 随身册可以只复制地址、不连带预订号。
--
-- 注意：本机没有 supabase CLI / service_role key，以下 SQL 需手动在
-- Supabase 控制台 → SQL Editor 执行（不是 git push 自动跑）。
-- 本地档（localStorage）由前端代码兼容，无需此列。

alter table trip_items
  add column if not exists address text null;
