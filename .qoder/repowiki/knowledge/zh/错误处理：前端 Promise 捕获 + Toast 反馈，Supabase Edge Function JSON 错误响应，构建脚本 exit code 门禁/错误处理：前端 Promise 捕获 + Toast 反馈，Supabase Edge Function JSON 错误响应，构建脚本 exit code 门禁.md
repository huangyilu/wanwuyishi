---
kind: error_handling
name: 错误处理：前端 Promise 捕获 + Toast 反馈，Supabase Edge Function JSON 错误响应，构建脚本 exit code 门禁
category: error_handling
scope:
    - '**'
source_files:
    - src/ui/toast.tsx
    - src/data/adapters/local-trip.ts
    - src/data/adapters/supabase-trip.ts
    - src/data/adapters/static-json-world.ts
    - src/features/trip/ChatPanel.tsx
    - src/features/auth/LoginDialog.tsx
    - src/features/auth/AccountDialog.tsx
    - supabase/functions/chat-proxy/index.ts
    - scripts/validate-content.ts
    - src/domain/trip/rank.ts
    - src/domain/trip/rank.test.ts
---

## 1. 整体方法

本仓库是一个以 Vite + React + TypeScript 构建的前端应用，后端通过 Supabase（数据库 + Edge Function）提供协作与 AI 能力。错误处理没有统一的异常类型体系或全局中间件，而是按运行环境分层采用以下约定：

- **前端运行时**：使用原生 `throw new Error(...)` 抛出业务/配置错误，配合 `.catch()` 在调用点捕获；用户可见的错误统一通过自研的 `ToastProvider` / `useToast()` 弹出提示。
- **Supabase Edge Function**：不抛异常，而是返回 `{ error, ... }` 形式的 JSON Response，并带上 HTTP 状态码（400/401/500），由前端解析后展示。
- **构建/校验脚本**：将问题分为 `error` 与 `warn` 两类，遇到 `error` 级别时 `process.exit(1)` 阻断 CI。
- **领域层函数**：对非法输入直接 `throw new Error(...)`，并通过单元测试用 `toThrow()` 断言。

## 2. 关键文件与位置

| 层次 | 文件 | 作用 |
|---|---|---|
| 前端 UI 反馈 | `src/ui/toast.tsx` | 全站唯一的 Toast 组件，定义 `ToastKind = 'success' | 'error' | 'warn' | 'info'`，提供 `ToastProvider` 与 `useToast()` |
| 数据适配层 | `src/data/adapters/local-trip.ts`、`src/data/adapters/supabase-trip.ts`、`src/data/adapters/static-json-world.ts` | 本地存储、Supabase 查询、静态世界库读取，集中抛出 `Error`（如“行程不存在”“Supabase 未配置”“世界库资源缺失”） |
| 认证/登录 | `src/features/auth/LoginDialog.tsx`、`src/features/auth/AccountDialog.tsx`、`src/features/auth/useProfile.ts` | 捕获登录/更新昵称等操作异常，并用 toast 提示 |
| 特性模块 | `src/features/trip/ChatPanel.tsx`、`CollaborateDialog.tsx`、`ItemEditor.tsx` 等 | 调用 Edge Function / 协作 RPC 时 try-catch 捕获网络或解析错误，再转成用户可读消息 |
| Edge Function | `supabase/functions/chat-proxy/index.ts` | 仅做 DeepSeek 中继，所有错误以 `{ error }` JSON + HTTP 状态码返回 |
| 构建校验 | `scripts/validate-content.ts` | 内容校验器，`error` 级问题退出码 1，`warn` 仅打印 |
| 领域层 | `src/domain/trip/rank.ts`、`src/domain/world/schema.ts` | 纯函数对非法参数抛 `Error`，测试用 `toThrow()` 验证 |

## 3. 架构与约定

### 3.1 前端：Promise 异常 + Toast 呈现
- 数据适配器在找不到资源时直接 `throw new Error('...')`，例如 `local-trip.ts` 中“行程不存在”“该成员已有账本记录，先处理账目再移除”，`static-json-world.ts` 中“世界库资源缺失”。
- 调用方（Auth/Trip 等 feature 组件）用 `try { ... } catch (e) { ... }` 捕获，再通过 `useToast()(msg, 'error')` 弹出提示，而不是把错误向上传播到路由层。
- 配置缺失（如 `VITE_SUPABASE_URL`、JWT token）在入口处直接 `throw new Error('...未配置')`，因为这类错误属于启动期故障，无法优雅降级。

### 3.2 Toast 系统
- `src/ui/toast.tsx` 是全站唯一的通知机制，`ToastKind` 限定为 `success | error | warn | info`，默认 3.2s 自动消失，点击可关闭。
- 所有用户可见的错误都走 `kind: 'error'` 路径，成功操作走 `'success'`，信息类提示走 `'info'`。

### 3.3 Supabase Edge Function：JSON 错误响应
- `chat-proxy/index.ts` 中每个异常分支都返回 `json({ error: '...' }, status)`，包括：缺少 authorization（401）、缺少 API Key（500）、messages 格式错误（400）、上游 DeepSeek 返回非 ok（透传 upstream.status）。
- 顶层 `try/catch` 兜底，将未预期异常转为 `{ error: String(err) }` 500 响应。
- 前端 `ChatPanel.tsx` 在调用 `supabase.functions.invoke('chat-proxy', ...)` 后，若 `!res.ok` 则构造 `throw new Error('函数返回非 JSON：...')`，再由上层 try-catch 捕获并 toast。

### 3.4 构建/校验脚本：exit code 门禁
- `scripts/validate-content.ts` 将问题标记为 `level: 'error'` 或 `level: 'warn'`，仅当存在 error 时 `process.exit(1)`，用于 CI 门禁。
- 输出带颜色区分（red/yellow/green），便于开发者快速定位。

### 3.5 领域层：防御式编程 + 单元测试断言
- 领域函数（如 `rankBetween`）对非法输入直接 `throw new Error(...)`，不返回 Result/Either 包装。
- 测试文件（`*.test.ts`）使用 `expect(() => fn(...)).toThrow()` 断言异常行为，形成契约。

## 4. 约定与约束

| 场景 | 约定 | 证据来源 |
|---|---|---|
| 前端运行时错误 | 使用 `throw new Error('中文描述')`，由调用方 try-catch 捕获 | `src/data/adapters/*.ts`、`src/features/trip/ChatPanel.tsx` |
| 用户可见错误 | 必须通过 `useToast()(msg, 'error')` 提示，禁止 console 替代 | `src/ui/toast.tsx` 注释“零依赖、零后端，满足「操作后给反馈」的基本诉求” |
| 配置缺失 | 启动期直接 `throw new Error('...未配置')`，不静默降级 | `src/data/supabase-client.ts`、`src/features/trip/ChatPanel.tsx` |
| Edge Function 错误 | 返回 `{ error }` JSON + HTTP 状态码，不抛 JS 异常 | `supabase/functions/chat-proxy/index.ts` |
| 构建校验失败 | `error` 级问题 `process.exit(1)` 阻断 CI | `scripts/validate-content.ts` |
| 领域函数非法输入 | 直接 `throw new Error(...)`，测试用 `toThrow()` 断言 | `src/domain/trip/rank.ts` + `rank.test.ts` |

**未发现的模式**：仓库中没有自定义错误类（如 `class AppError extends Error`）、没有全局错误边界（React Error Boundary）、没有统一的错误码枚举、也没有基于 Result/Either 的函数式错误传播——错误处理是“就地 throw + 就近 catch + toast 呈现”的轻量风格。