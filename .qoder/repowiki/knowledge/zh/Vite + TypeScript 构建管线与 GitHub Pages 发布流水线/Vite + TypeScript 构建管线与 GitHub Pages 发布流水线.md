---
kind: build_system
name: Vite + TypeScript 构建管线与 GitHub Pages 发布流水线
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - vite.config.ts
    - tsconfig.json
    - .github/workflows/deploy.yml
    - scripts/build-index.ts
    - scripts/validate-content.ts
    - scripts/content-io.ts
    - scripts/build-pmtiles.sh
---

## 1. 构建系统与工具链

本项目采用 **Vite 5** 作为前端构建中枢，配合 **TypeScript 5**（`noEmit` 模式，仅做类型检查）和 **Vitest 2** 测试框架。所有脚本通过 `package.json` 的 `scripts` 字段统一编排，入口为 `npm run dev / build / test`。

- 开发：`npm run dev` → 先执行 `content:build` 生成世界库运行时数据，再启动 Vite 开发服务器（端口 5273，`strictPort: false` 允许自动切换端口）。
- 生产构建：`npm run build` → 依次执行 `content:check`（校验 + 编译内容）、`tsc -b`（增量类型检查）、`vite build`（Rollup 打包）。
- 预览：`npm run preview` 提供本地静态产物预览。
- 测试：`vitest run` 执行 `src/**/*.test.ts`，运行环境为 `node`。

Vite 配置 (`vite.config.ts`) 关键决策：
- `base: './'`：以相对路径部署到 GitHub Pages 子路径（`username.github.io/<repo>/`），并兼容离线 `file://` 访问。
- 路径别名 `@/*` → `src/*`，同时被 tsconfig 与 Vite 共享。
- 代码分割：通过 Rollup `manualChunks` 将 `react/react-dom/react-router-dom`、`@tanstack/react-query` 单独拆包；其余按 `AppShell` 中的动态 `import()` 实现双端分流。
- 目标平台 `target: 'es2020'`。

## 2. 世界库内容构建管线

项目维护一份结构化 JSON 世界库（`content/{countries,cities,pois}/*.json`），在构建期经脚本编译为前端可直接加载的静态资源，输出至 `public/data/`。

- **校验** (`scripts/validate-content.ts`)：两层校验——zod schema 结构校验 + `src/domain/world/schema.js` 中 `checkPoiRules` 业务规则（引用完整性、坐标越界、时长区间、深导览缺失、时效等）。error 级问题使进程非零退出，warn 仅提示。
- **编译** (`scripts/build-index.ts`)：读取校验通过的内容，剥离编著期字段（`_todo`/`_sources`），生成：
  - `public/data/index.json`（国家+城市摘要+POI 摘要，一次请求获取导航所需全部数据）
  - `public/data/country/<id>.json`、`city/<id>.json`、`poi/<id>.json`（全文）
  - `public/data/search.json`（轻量搜索索引）
  - `public/data/aliases.json`（旧 id→新 id 映射，保证老行程不断链）
- 依赖 `scripts/content-io.ts` 统一读写 `content/` 与 `public/data/`。

该管线通过 `npm run content:check` 串联，并在 CI 中强制执行，是内容变更的准入门禁。

## 3. 矢量地图瓦片构建

`scripts/build-pmtiles.sh` 独立于 Vite 管线，用于生成「法意瑞」范围的矢量地图瓦片（`.pmtiles`），输出到 `public/tiles.pmtiles`，由 MapPanel 自动探测启用。

- 不依赖 Homebrew/Xcode CLT：Java 21+ 从 Adoptium 下载 tar 包解压，`pmtiles` 与 `Planetiler` 均从 GitHub Releases 拉取最新二进制/JAR 并缓存到 `.tilebuild/`。
- 支持跨架构（Intel/Apple Silicon）自动判定。
- 通过环境变量 `MAXZOOM` 控制细节层级（默认 12），单文件超过 100MB 会给出警告（GitHub Pages 单文件硬上限）。
- 产物随 GitHub Pages 一起部署，无需额外 key。

## 4. CI/CD 流水线（GitHub Actions）

`.github/workflows/deploy.yml` 定义了两阶段流水线：`build` → `deploy`。

- **触发**：push 到 `main` 分支或手动 `workflow_dispatch`。
- **并发控制**：`concurrency.group: pages`，`cancel-in-progress: false`，避免并发覆盖。
- **构建阶段**：Ubuntu runner，Node 22 + npm 缓存，依次执行：
  1. `npm ci`
  2. `npm run content:check`（内容校验 + 编译）
  3. `npx tsc --noEmit`（纯类型检查）
  4. `npx vitest run`（单元测试）
  5. `npm run build`（最终产物输出到 `dist/`）
  6. `actions/upload-pages-artifact@v3` 上传 `dist`
- **部署阶段**：使用 `actions/deploy-pages@v4` 发布到 GitHub Pages，环境名为 `github-pages`。
- **Secrets 注入**：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 通过 GitHub Secrets 注入，供构建期替换。

## 5. 约定与约束

- **内容即源码**：世界库数据位于 `content/`，运行时数据位于 `public/data/`，二者严格分离；任何内容变更必须先通过 `content:check`。
- **构建产物不可提交**：`dist/` 由 CI 产出，本地 `build` 后直接推 `dist/` 会被忽略。
- **类型安全贯穿**：tsconfig 开启 `strict`、`noUnusedLocals`、`noUncheckedIndexedAccess`，并通过 `tsc -b` 增量检查；脚本本身也用 TypeScript 编写并由 tsconfig 纳入范围。
- **测试位置约定**：单元测试文件必须命名为 `*.test.ts` 且位于 `src/` 下，才能被 Vitest 自动发现。
- **路径别名统一**：`@/*` 在 tsconfig 与 vite.config 中保持一致，避免导入歧义。
- **版本管理**：`package.json` 中 `version` 字段存在但仓库未配置自动化版本号递增；发布主要依赖 Git tag + GitHub Pages 快照。