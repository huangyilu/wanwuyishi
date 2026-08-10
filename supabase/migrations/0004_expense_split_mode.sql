-- 4. expenses.split_mode —— 区分「共同 AA」与「个人自付」
--    'aa'（默认）= 计入共同分摊结算；'personal' = 个人承担，结算时整笔跳过。
--    注意：get_trip_bundle 用 to_jsonb(e) 返回整行，新增列会自动出现在 bundle 中，
--    无需改动 RPC。

alter table public.expenses
  add column if not exists split_mode text not null default 'aa'
  check (split_mode in ('aa', 'personal'));
