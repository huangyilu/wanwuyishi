-- 009 · 城市自由文本列
-- 适配器 src/data/adapters/supabase-trip.ts 的 mapDay / mapItem 与 updateDay / updateItem
-- 依赖以下三列来存「世界库没有、用户自己输入的城市名」。它们与世界库引用列
-- (city_id / from_city_id / to_city_id) 互斥：一个非空时另一个必为 null。
-- 此前这三列从未在任何迁移里创建，导致「选择或输入城市」一保存就报
--   column "custom_city" does not exist
-- 乐观更新随即回滚，表现为“输入后无法保存”。
-- 用 if not exists 保证幂等，可重复执行。每条单独一条 ALTER，规避多列合一在个别环境报错。

alter table public.trip_days add column if not exists custom_city text;
alter table public.trip_items add column if not exists custom_from_city text;
alter table public.trip_items add column if not exists custom_to_city text;
