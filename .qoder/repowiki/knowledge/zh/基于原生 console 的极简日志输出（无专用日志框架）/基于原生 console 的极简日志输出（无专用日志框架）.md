---
kind: logging_system
name: 基于原生 console 的极简日志输出（无专用日志框架）
category: logging_system
scope:
    - '**'
source_files:
    - scripts/build-index.ts
    - scripts/fetch-city-images.mjs
    - scripts/fetch-poi-images.mjs
    - scripts/fetch-new-images.mjs
    - src/data/adapters/static-json-world.ts
    - package.json
---

## 1. 使用的系统/方案

仓库没有引入任何第三方日志库（如 winston、pino、bunyan、log4js、signale、chalk、debug 等），也没有自定义 logger 模块。运行时与构建期脚本全部使用 Node.js / 浏览器原生的 `console` API 进行输出：
- `console.log`：常规进度、结果信息（scripts 目录下的所有构建/抓取脚本，如 `scripts/build-index.ts`、`scripts/fetch-city-images.mjs`、`scripts/fetch-poi-images.mjs`、`scripts/fetch-new-images.mjs`）。
- `console.error`：错误与失败提示（如 `scripts/build-index.ts` 中内容校验失败时打印结构错误摘要）。
- `console.warn`：降级/异常警告（仅一处：`src/data/adapters/static-json-world.ts:72` 在 POI 数据校验失败时以 `[world] POI ${id} 结构异常，已降级` 形式降级处理）。

前端应用本身不主动产生业务日志；唯一的前端 `console` 调用位于世界库静态数据适配器中，用于对 Zod 校验失败的 POI 记录发出降级告警。

## 2. 关键文件
- `scripts/build-index.ts`：构建期索引生成，使用 `console.log` / `console.error` 报告校验失败与构建进度。
- `scripts/fetch-city-images.mjs`、`scripts/fetch-poi-images.mjs`、`scripts/fetch-new-images.mjs`：图片抓取脚本，大量使用 `console.log` 输出逐条处理状态、下载大小、重试次数、缺失清单等。
- `src/data/adapters/static-json-world.ts`：前端唯一使用 `console.warn` 的位置，对不符合 schema 的 POI 数据做降级并输出带前缀的警告。
- `package.json`：未声明任何日志相关依赖。

## 3. 架构与约定
- **无中心化 logger**：不存在统一的 logger 初始化、配置或注入点。每个脚本/模块直接调用全局 `console`。
- **无结构化字段**：日志为纯文本字符串拼接，不包含时间戳、级别、上下文对象、traceId 等结构化字段。
- **无日志级别管理**：没有通过环境变量切换 debug/info/warn/error，也没有按模块开关日志。
- **无 sink/转储**：日志直接写入标准输出/标准错误，没有被重定向到文件、远程收集器或 Supabase Edge Function。
- **Vite 开发模式**：由 Vite 自身控制台承载前端输出，应用代码不额外包装。

## 4. 约定与约束
- 脚本侧约定：构建/运维脚本统一用 `console.log` 输出正常流程、`console.error` 输出错误；人类可读的进度行包含缩进和分隔线（如 `=== ${c.id} ===`、`-- pass ${pass + 1} done --`），便于人眼阅读而非机器解析。
- 前端侧约束：业务组件层不主动打日志；仅在数据适配层遇到不可恢复的结构问题时用 `console.warn` 发出可观测信号，并通过 try/catch 继续运行（降级策略）。
- 无强制规范：仓库中没有 ESLint 规则、tsconfig 或文档强制要求统一日志格式；当前做法是“需要输出时直接写 console”，属于最小实现。