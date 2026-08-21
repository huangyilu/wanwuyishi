---
kind: external_dependency
name: Supabase（Postgres + Auth + PostgREST）
slug: supabase
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
    - client_constraint
scope:
    - '**'
source_files:
    - src/data/supabase-client.ts
    - .env.example
    - .github/workflows/deploy.yml
    - supabase/migrations/0001_init.sql
---

### 身份与数据后端
- 项目使用 Supabase 免费档作为唯一云端后端：Postgres（RLS 行级安全）、GoTrue 认证、PostgREST/RPC。
- 前端通过 `@supabase/supabase-js` 客户端接入，凭据来自环境变量 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`；未配置时自动回退到本地适配器（LocalTripRepository），应用仍可离线运行。
- 认证方式支持匿名登录（需后台开启 Anonymous sign-ins）、邮箱+密码、邮箱 OTP（Magic Link）三种；会话持久化在 localStorage，且关闭 `detectSessionInUrl` 以避免与 HashRouter 冲突。
- CI 构建阶段将 anon key 注入为环境变量，随 dist 产物发布到 GitHub Pages。

### 集成要点
- 迁移脚本位于 `supabase/migrations/`，需在 Supabase Dashboard 中执行。
- 地图瓦片走 OSM 官方 tile server（免费无 key），但禁止批量缓存瓦片。