---
kind: external_dependency
name: GitHub Pages（静态托管 + CI 部署）
slug: github-pages
category: external_dependency
category_hints:
    - vendor_identity
    - migration_status
scope:
    - '**'
source_files:
    - .github/workflows/deploy.yml
---

### 部署目标
- 项目通过 GitHub Actions 工作流 `.github/workflows/deploy.yml` 触发构建并部署到 GitHub Pages 环境（`actions/deploy-pages@v4`）。
- 触发条件：push 到 main 分支或手动 workflow_dispatch。
- 构建流程：`npm ci` → `content:check`（zod 校验 + build-index）→ TypeScript 类型检查 → Vitest 单测 → `vite build` → 上传 dist 作为 Pages artifact。
- 构建期注入 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（来自仓库 Secrets），因此生产构建会连接真实 Supabase。

### 约束与取舍
- 采用 HashRouter（`/#/...`）以兼容 GitHub Pages 子路径部署，无需 404.html 回退。
- 技术文档明确此前曾考虑 Cloudflare Pages 但最终回退到 GitHub Pages，因其免费额度对当前体量足够。