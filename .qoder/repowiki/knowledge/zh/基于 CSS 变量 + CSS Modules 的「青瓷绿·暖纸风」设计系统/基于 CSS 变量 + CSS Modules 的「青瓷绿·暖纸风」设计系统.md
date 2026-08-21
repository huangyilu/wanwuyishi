---
kind: frontend_style
name: 基于 CSS 变量 + CSS Modules 的「青瓷绿·暖纸风」设计系统
category: frontend_style
scope:
    - '**'
source_files:
    - src/ui/tokens.css
    - src/ui/base.css
    - src/ui/panel.module.css
    - src/ui/toast.module.css
    - src/ui/toast.tsx
    - src/app/AppShell.module.css
    - src/features/trip/mapMarkers.css
    - src/features/auth/AuthBar.module.css
    - src/features/auth/LoginDialog.module.css
    - src/features/expense/LedgerPanel.module.css
    - src/features/trip/ChatPanel.module.css
    - src/features/trip/ItemEditor.module.css
    - src/features/trip/MobileTrip.module.css
    - src/features/trip/PackingPanel.module.css
    - src/features/trip/Timeline.module.css
    - src/features/world/PoiGuideCard.module.css
    - src/pages/TripPage.module.css
---

## 1. 采用的体系与工具

- **CSS 变量（Design Tokens）集中管理**：所有颜色、字体、圆角、阴影、布局常量均定义在 `src/ui/tokens.css` 的 `:root` 中，主题切换通过覆盖变量实现。注释明确说明“浅/暗主题靠变量驱动切换，改这一处即可全局换肤；组件不写死颜色”。
- **CSS Modules 作为组件样式隔离方案**：每个 React 组件与其 `.module.css` 一一对应，通过 `import s from './xxx.module.css'` 引入，避免全局类名冲突。
- **无第三方 UI 框架**：未使用 Tailwind、Ant Design、MUI 等，全部样式手写原生 CSS，依赖 Vite 构建。
- **共享基础样式层**：`src/ui/base.css` 通过 `@import './tokens.css'` 引入 token，并统一重置 HTML 元素、提供通用小组件类（`.btn`、`.field`、`.tag`、`.num`、`.muted`、`.scroll-y`）以及打印媒体查询。
- **共享面板外壳**：`src/ui/panel.module.css` 提供跨功能模块复用的页面容器（`.page`）、卡片（`.card`）、头部条（`.head`）、小节头（`.sectionHead`）、空态（`.empty`）等“外壳词汇”，各面板内部布局保留在自己的 module 中。
- **全局 Toast 组件**：`src/ui/toast.tsx` + `toast.module.css` 提供固定顶部居中的通知组件，支持 success/error/warn/info 语义色变体。
- **地图标记全局样式**：`src/features/trip/mapMarkers.css` 为 Leaflet 自定义标记提供全局样式（因 divIcon 的 HTML 不走 CSS Module 哈希），复用 `--brand`、`--text-1` 等 token。

## 2. 关键文件

- `src/ui/tokens.css` — 设计令牌中心（品牌色、文字层级、表面层级、描边、状态色、字体、圆角、阴影、布局常量、手帐质感纹理）
- `src/ui/base.css` — 全局 reset + 通用小组件样式 + 打印样式
- `src/ui/panel.module.css` — 跨功能模块共享的面板外壳
- `src/ui/toast.module.css` / `src/ui/toast.tsx` — 全局通知组件
- `src/app/AppShell.module.css` — 应用外壳（PC 顶栏 + 移动端底部 Tab 栏）
- `src/features/trip/mapMarkers.css` — Leaflet 标记全局样式
- 各 feature 下的 `*.module.css`：AuthBar、LoginDialog、LedgerPanel、ChatPanel、ItemEditor、MemberAvatar、MobileTrip、PackingPanel、TicketEditor、Timeline、VotePanel、Workbench、collaborate、PoiGuideCard、WorldNav、TripPage、TripsPage、ClickableImage、CopyButton

## 3. 架构与设计约定

- **视觉风格**：注释定义为“青瓷绿 + 暖纸风（teal 品牌 + 米纸画布）”，背景采用 CSS radial-gradient 模拟方格手帐纸点阵（`--tex-dot`），标题使用衬线字体（`--font-display`：Iowan Old Style/Palatino/Songti SC），营造“探险手帐”调性。
- **色彩体系**：以 `--brand`（#4a7f7c）为主色，配合 `--brand-hover`、`--brand-soft`、`--brand-ink`、`--on-brand` 构成品牌色阶；文字分三级 `--text-1/2/3`；表面层级用 `--bg-sub`（画布）、`--surface-1`（面板）、`--surface-2`（嵌套面板）区分；行程状态色（wishlist/candidate/confirmed/visited/dropped）独立命名。
- **字体策略**：正文使用系统字体栈（含 PingFang SC、Microsoft YaHei），数字使用等宽字体（`--font-num`），展示标题使用衬线字体回落到宋体。
- **响应式策略**：通过 `@media (max-width: 640px)` 和 `@media (min-width: 1600px)` 分别处理移动端与超宽屏；移动端外壳在 `AppShell.module.css` 中以 `mShell`、`mTabs`、`mTab` 等类名单独实现底部 Tab 导航。
- **组件化粒度**：每个 React 组件拥有独立的 `.module.css`，共享的“外壳词汇”（如 panel、toast）集中在 `src/ui/` 下被多组件复用；业务内聚的样式留在 feature 目录内。
- **无障碍与可访问性**：按钮继承 `font: inherit`，输入框继承 `color: inherit`，focus 态通过 `box-shadow` 提供可见焦点指示。

## 4. 约定与约束

- **禁止硬编码颜色**：token 文件中明确声明“组件不写死颜色”，所有样式通过 `var(--*)` 引用设计令牌。
- **样式隔离**：组件级样式一律使用 CSS Modules（`.module.css`），仅在全局需要时（如 Leaflet 标记、base reset）才使用全局 CSS。
- **共享外壳复用**：跨功能模块的页面容器、卡片、头部条等必须复用 `panel.module.css` 提供的类，以保证标签页切换时的视觉一致性。
- **主题扩展点**：新增主题只需覆盖 `:root` 中的 CSS 变量，无需修改组件样式。
- **打印导出**：通过 `@media print` 隐藏非打印元素（`.no-print`），调整字号与背景，用于签证行程单与旅行记录的 PDF 导出。
- **滚动条定制**：全局统一使用 `scroll-y` 类并提供 WebKit 滚动条样式，保持滚动区域视觉一致。
- **移动端安全区**：移动端 Tab 栏使用 `env(safe-area-inset-bottom)` 适配刘海屏设备。

该风格系统在仓库中贯穿 `app`、`components`、`features`、`pages` 各层，形成统一的“青瓷绿·暖纸风”视觉语言，并通过 CSS Variables + CSS Modules 的组合实现高内聚、低耦合的可维护样式架构。