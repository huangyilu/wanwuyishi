# 世界库编写规范

这个目录是世界库的**编著源文件**（给人和 AI 写的），不是运行时数据。
运行时数据由 `npm run content:build` 生成到 `public/data/`，那个目录不要手改。

```
content/
├─ countries/<iso2>.json      国家：签证、货币、应急电话
├─ cities/<slug>.json         城市：生存信息、通票
└─ pois/<slug>.json           景点：基础信息 + volatile + guide 深导览
```

## 三条硬规则

1. **一切会变的信息必须带来源与核实日期。** 票价、开放时间、预约方式一律写进 `volatile`，
   每项都要有 `source`（官方 https 链接）与 `verifiedAt`（YYYY-MM-DD）。校验脚本会拦截缺失项。
2. **闭馆日必须结构化，不能只写在自然语言里。** `openness.closedWeekdays`（0=周日 … 6=周六）
   与 `openness.closedDates` 是"闭馆日校验"算法的输入，写在 `volatile.hours` 的句子里等于没写。
3. **深导览的亮点必须带展厅位置。** `guide.highlights[].location` 精确到馆翼/展厅号，
   这是深导览区别于普通攻略的唯一硬指标。

## 字段速查

| 字段 | 说明 |
| --- | --- |
| `id` | `poi-<slug>` / `city-<slug>` / 国家用 ISO 3166-1 alpha-2 小写 |
| `localName` | 当地语言原名，问路、地图匹配、购票核对都要用 |
| `popularity` | 0-100，城市页排序依据；≥80 的博物馆强制要求配 `guide` |
| `visit.durationMinutes` | `[下限, 上限]` 分钟，"一天排太满"体检要拿它运算 |
| `booking.leadDays` | 建议提前 N 天预约，驱动"该订票了"提醒 |
| `_todo` | 编著期待办，构建时剥离，不进运行时数据 |

## 工作流

```bash
npm run content:validate   # 结构 + 业务规则校验（CI 门禁）
npm run content:build      # 生成 public/data/ 与搜索索引
```

AI 生成草稿后**必须**逐条打开 `source` 链接人工核对，核对通过才写 `verifiedAt`。
没核对过的项目留在 `_todo` 里，校验脚本会以 warn 形式持续提醒。

## 明确不做

不爬取官网票价页（反爬与 ToS 风险），不抓取小红书/马蜂窝内容（版权与反爬）。
骨架数据来自 Wikidata / Wikipedia / OpenStreetMap，正文由 AI 起草 + 人工核对官方源。
