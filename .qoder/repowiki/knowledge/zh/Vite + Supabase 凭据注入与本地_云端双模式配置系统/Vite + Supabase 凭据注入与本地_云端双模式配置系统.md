---
kind: configuration_system
name: Vite + Supabase 凭据注入与本地/云端双模式配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - vite.config.ts
    - package.json
    - src/data/supabase-client.ts
    - src/data/adapters/local-trip.ts
    - src/data/adapters/supabase-trip.ts
    - scripts/build-index.ts
    - supabase/functions/chat-proxy/index.ts
---

## 1. 使用的系统与框架

- **构建期配置**：基于 Vite（`vite.config.ts`），通过 `defineConfig`、`base`、`server.port`、`build.target`、`manualChunks`、`test.environment` 等选项控制开发服务器、产物目标与测试环境。
- **运行时环境变量**：使用 Vite 的 `import.meta.env.*` 注入客户端可见的环境变量，前缀 `VITE_` 是约定（见 `.env.example` 中的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`）。
- **Supabase Edge Function 配置**：通过 `supabase secrets set DEEPSEEK_API_KEY=...` 注入服务端密钥，Edge Function 内用 `Deno.env.get('DEEPSEEK_API_KEY')` 读取。
- **内容数据配置**：`content/` 下的国家/城市/POI JSON 为“编著期”配置源，由 `scripts/build-index.ts` 在构建时编译到 `public/data/` 的静态 JSON，供前端直接加载。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `.env.example` | 定义客户端所需的环境变量模板（Supabase URL 与匿名 key） |
| `vite.config.ts` | Vite 构建/开发/测试配置入口 |
| `package.json` | `dev` / `build` / `content:check` / `content:build` 等脚本串联配置校验与构建 |
| `src/data/supabase-client.ts` | 读取 `import.meta.env.VITE_SUPABASE_*`，构造 Supabase 客户端单例，暴露 `isSupabaseConfigured()` |
| `src/data/adapters/local-trip.ts` | 未配置 Supabase 时的本地 localStorage 适配器（`capabilities.canSync = false`） |
| `src/data/adapters/supabase-trip.ts` | 配置就绪后的 Supabase 云端适配器（`capabilities.canSync = true`） |
| `scripts/build-index.ts` | 把 `content/` 的 JSON 编译成 `public/data/*.json` 运行时数据 |
| `supabase/functions/chat-proxy/index.ts` | Edge Function 中从 `Deno.env` 读取 `DEEPSEEK_API_KEY` |

## 3. 架构与设计决策

### 3.1 环境变量 → 运行模式切换
应用采用**零配置可运行**策略：clone 后不填任何 `.env` 也能启动，此时 `isSupabaseConfigured()` 返回 `false`，`supabase` 单例为 `null`，上层通过工厂选择 `LocalTripRepository`；一旦填入 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 并重启 dev server，即自动切换到 `SupabaseTripRepository`。两个 adapter 实现同一 `TripRepository` 接口，UI 层无感切换。

### 3.2 配置分层
- **构建期常量**：写在 `vite.config.ts`（端口 5273、`base: './'` 适配 GitHub Pages 子路径、`target: 'es2020'`、`manualChunks` 拆分 vendor/query）。
- **客户端运行时配置**：仅 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 通过 `import.meta.env` 注入浏览器，其他如 DeepSeek API Key 只存在于 Supabase Edge Function 的 `Deno.env`，不会泄露到前端。
- **服务端/Edge 配置**：通过 `supabase secrets set` 注入，Edge Function 内以 `Deno.env.get` 读取。
- **内容数据配置**：`content/` 下的 JSON 是“编著期”配置，构建时被剥离 `_todo`/`_sources` 等字段，产出干净的 `public/data/*.json` 给前端静态加载。

### 3.3 能力声明与降级
每个 adapter 暴露 `kind` 与 `capabilities`（`canWrite`、`canSync`），UI 据此显示“仅本机”或“已同步”状态标记；本地 adapter 对协作邀请相关方法直接抛错（“仅云端模式支持”），明确区分能力边界。

## 4. 约定与约束

- **客户端环境变量必须以 `VITE_` 开头**：只有带该前缀的变量才会被 Vite 注入到 `import.meta.env`，这是 Vite 的内置约定，项目严格遵循（`.env.example` 与 `supabase-client.ts` 均如此）。
- **Supabase 凭据可选但影响功能**：未配置时应用退化为纯本地模式，所有写操作仍可用，但 `canSync = false`，协作邀请、加入行程等依赖云端的功能不可用。
- **Edge Function 必须配置 `DEEPSEEK_API_KEY`**：`chat-proxy` 在未设置该 secret 时返回 500 错误消息 `Server not configured (DEEPSEEK_API_KEY missing)`，调用方需先部署 secrets。
- **构建流水线强制内容校验**：`npm run build` 会先执行 `npm run content:check`（即 `validate-content.ts` + `build-index.ts`），若 `content/` 结构错误则构建失败，保证 `public/data/` 始终一致。
- **GitHub Pages 子路径部署**：`vite.config.ts` 中 `base: './'` 是显式约定，使资源与路由在 `<repo>/` 子路径及离线 `file://` 下均可加载。
- **RLS 强制登录**：注释明确指出所有迁移表的 RLS 策略基于 `auth.uid()`，因此云端模式必须先登录才能读写，匿名角色无任何写权限。
- **适配器字段对齐迁移**：`local-trip.ts` 与 `supabase-trip.ts` 都强调与 `supabase/migrations/0001_init.sql` 逐字段对齐，确保两种存储后端在视图层完全可互换。