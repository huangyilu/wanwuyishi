-- =====================================================================
-- 玩无一失 · 迁移 0003
-- 目标：trips 增加 packing（打包清单）jsonb 列，承载「打包助手」数据。
-- 说明：在 0002 之后执行。幂等，可重复粘贴。
--       列表项结构见 src/data/types.ts 的 PackingItem：
--         [{ id, category, text, done, assigneeId, note }]
--       本地档（localStorage）已默认 packing:[]；本迁移只补云端表列。
-- 注意：若 get_trip_bundle RPC 用 `select 列清单` 而非 `to_jsonb(t)`，
--       需同步把 packing 加入 RPC 的返回投影，否则云端读取时为 null（前端兜底为 []）。
-- 参考文档：docs/技术方案.md 第 4 章 trips
-- =====================================================================

alter table public.trips add column if not exists packing jsonb not null default '[]'::jsonb;

-- 兜底：旧行 null 修成空数组
update public.trips set packing = '[]'::jsonb where packing is null;

-- =====================================================================
-- 完
-- =====================================================================
