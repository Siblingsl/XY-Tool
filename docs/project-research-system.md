# 项目研究系统 — 功能规格与开发文档

> 本文档供后续实现真实业务逻辑时直接执行。  
> **本期已交付**：独立前端 UI 原型（`web-research/`，Mock 数据）+ 后端项目区占位（`GET /api/research/health`）+ 闲鱼/研究双端系统切换。  
> **本期未交付**：Gmail OAuth、真实邮件拉取、联网搜索、Agent 推理、真实评分与报告生成。

---

## AI 速读卡

- **产品**：从 Gmail 邮件中发现投资/副业/SaaS 机会，五层 Agent 流水线验证真实性并评估「我能不能做」，输出每日投资报告。
- **硬约束**：③ 真伪验证层禁止 AI 编造外部事实；须基于公开可检索来源；营销垃圾邮件自动丢弃。
- **前端**：`web-research/`（端口 5174），与闲鱼 `web/`（5173）独立；顶栏系统切换真跳转。
- **后端**：共用 NestJS，研究域 API 前缀一律 `/api/research/*`，与闲鱼业务表/模块隔离。
- **鉴权**：共用 `/api/auth`；本期原型各自 localStorage；后期建议同域 cookie / SSO。
- **P0**：Gmail 同步 → 营销过滤 → 项目识别 → 证据型验证（可先接 3～5 个源）→ 落地评分 → 日报。

---

## 第一章：产品概述

### 1.1 一句话

每天自动读你的创业/产品邮件，拆成项目卡片，联网验真，判断适不适合个人落地，晚上出一份「今日值得研究什么」的报告。

### 1.2 目标用户

独立开发者 / 想找副业方向的个人；主要输入源是 Newsletter、Product Hunt、YC、融资快讯等邮件。

### 1.3 可行性边界

| 类型 | 内容 |
|------|------|
| 硬约束 | 验证层不得编造收入/用户/融资/Star；无证据则标记 `unverified` 并降权 |
| 硬约束 | 研究数据与闲鱼发货数据物理隔离（表前缀或 schema：`research_*`） |
| 推荐默认 | 验证源可分阶段接入；P0 至少：Google 搜索摘要、GitHub、Product Hunt、Reddit/HN 之一 |
| 发挥空间 | 热度图样式、报告推送渠道（邮件/Webhook）、UI 视觉 |

### 1.4 本期原型 vs 后续逻辑

| 能力 | 原型（已做） | 后续实现 |
|------|--------------|----------|
| 系统切换 | 双端下拉跳转 | 可加同域 SSO |
| 仪表盘/列表/详情/报告/流水线/设置 | Mock UI | 接真实 API |
| Gmail | 设置页「待接入」按钮 | OAuth + 增量同步 |
| Agent | 流水线页状态动画 | Bull 队列 + LLM + 搜索 |
| 验证 | 详情页展示假证据列表 | 真实爬取/API |

---

## 第二章：整体布局与导航

### 2.1 信息架构

```
项目研究系统
├── 今日概览          /dashboard
├── 邮件流水          /emails
├── 项目卡片库        /projects
│   └── 项目详情      /projects/:id
├── 每日报告          /reports
├── Agent 流水线      /pipeline
├── 设置              /settings
└── 个人中心          /profile
```

### 2.2 顶栏系统切换

- 左侧：`Select` 当前系统 + 可切换到「闲鱼自动发货系统」
- 跳转：`VITE_SISTER_APP_URL`（默认闲鱼 `http://localhost:5173`）
- 闲鱼端对称：默认研究 `http://localhost:5174`
- Query：`?from=switch` 可选，用于提示「已从另一系统切入」

### 2.3 视觉区分

- 侧栏主题色：青绿/墨绿（`#0f766e` 系），与闲鱼默认深蓝区分
- 折叠品牌字：`研`

---

## 第三章：核心模块详细设计

### 3.1 流水线总览

```
Gmail
  │
  ▼
① 邮件解析 Agent
  │  (营销过滤可在此截断)
  ▼
② 项目识别 Agent  → Project Card
  │
  ▼
③ 真伪验证 Agent（联网，禁止臆造）
  │
  ├── 竞争分析
  ├── 市场热度
  └── 过时/红海判断
  ▼
④ 可落地评分 Agent
  │
  ▼
⑤ 每日投资报告 + 重复聚类汇总
```

状态机（每封邮件 / 每个项目实例）：

```
pending → parsing → identifying → verifying → scoring → done
                ↘ filtered (营销垃圾)
                ↘ failed (可重试)
                ↘ skipped (重复聚类并入已有簇)
```

---

### 3.2 ① 邮件解析 Agent

**输入**：Gmail 当天（或增量）新邮件。

**提取字段**：

| 字段 | 说明 |
|------|------|
| subject | 标题 |
| bodyText / bodyHtml | 正文 |
| from | 发件人 |
| links[] | 通用链接 |
| attachments[] | 含 PDF 等 |
| githubUrls[] | |
| youtubeUrls[] | |
| productUrls[] | |
| redditUrls[] | |
| twitterUrls[] | |

**分类标签（多选）**：`AI_SaaS` | `SideHustle` | `Startup` | `GitHub` | `OpenSource` | `Tool` | `ProductHunt` | `YC` | `Investment` | `Funding` | `SEO` | `Affiliate` | `Newsletter` | `Other`

**营销过滤（硬约束亮点①）**：标题/正文命中规则则 `status=filtered`，不进入②。

默认关键词示例：`Earn $`、`Get Rich`、`AI Millionaire`、`No Code`、`Passive Income`、`10000/month` 等（可在设置中配置）。

**失败路径**：

1. Gmail token 过期 → 标记 `auth_required`，设置页提示重新授权  
2. 邮件无正文且无链接 → `status=skipped`，原因 `empty_content`

---

### 3.3 ② 项目识别 Agent

**输入**：通过过滤的解析结果。

**输出 Project Card**：

| 字段 | 示例 |
|------|------|
| name | ClipMagic |
| type | AI Video |
| price | $29/月 |
| audience | YouTube Creator |
| model | 使用的模型（若有） |
| openSource | boolean / unknown |
| competitorsMentioned[] | 邮件内提到的竞品 |
| market | 市场描述 |
| launchYear | 2026 |
| author | |
| website | |
| clusterKey | 归一化方向键，如 `ai_ppt` |

**重复聚类（亮点②）**：名称/描述语义相近（AI PPT / AI Slides / Presentation AI）归入同一 `clusterId`；日报只计「真正新方向」数量。

**失败路径**：无法抽出可识别项目 → `status=no_project`，仅归档邮件。

---

### 3.4 ③ 真伪验证 Agent（核心）

**硬约束**：禁止模型「脑补」收入、用户数、融资、排名。只能引用检索到的证据；找不到则 `claimStatus=unverified`。

**必须覆盖的搜索面（可分批实现）**：

Google、GitHub、Product Hunt、Reddit、Hacker News、G2、Capterra、Trustpilot、Crunchbase、LinkedIn、YouTube、X(Twitter)、Google Trends。

**证据对象 Evidence**：

```json
{
  "source": "github",
  "url": "https://github.com/...",
  "claim": "stars",
  "value": "1280",
  "fetchedAt": "ISO8601",
  "snippet": "..."
}
```

**验证检查清单（邮件声称「月入 20 万」时）**：

- 公开收入披露 / Stripe 截图是否在可信来源出现  
- 采访、真实用户评价  
- GitHub Star、PH 排名、Trends、融资新闻  

**仅当验证任务完成（成功或明确无结果）后才进入④。**

**衍生：竞争分析（亮点③）**

输出：`competitorCount`、`topPlayers[]`（如 Gamma、Beautiful.ai、Canva）。

**衍生：市场热度（亮点④）**

综合 Trends / Star / Reddit / PH / X / YouTube → `heatScore` + 时间序列 `heatSeries[]`（供图表）。

**衍生：过时判断（亮点⑤）**

检索近年同方向密度 → `lifecycle: emerging | growing | saturated | declining`；红海则建议放弃。

**失败路径**：全部源超时 → `verifyStatus=degraded`，评分时强制降权并在报告标红。

---

### 3.5 ④ 可落地评分 Agent

**不是「项目好不好」，而是「我能不能做」。**

评分维度（建议 0–10 再加权到 100）：

| 维度 | 说明 |
|------|------|
| devDifficulty | 开发难度 |
| capitalNeeded | 启动资金 |
| teamRequired | 是否需要团队 |
| competition | 竞争程度 |
| modelCost | 模型成本 |
| promoCost | 推广成本 |
| chinaFeasible | 国内是否能做 |
| licenseNeeded | 许可证 |
| computeHeavy | 算力需求 |
| apiDependency | API 依赖 |
| soloFeasible | 能否一人完成 |

**输出**：

- `feasibilityIndex`：0–100  
- `stars`：1–5  
- `verdict`：`do` | `watch` | `skip`  
- `summary`：如「适合一个人 / 3 个月 / 启动资金 3000 / 可 MVP」  
- `mvpPlan`（亮点⑥）：按周拆解（登录 → 支付 → 接模型 → 上线）

---

### 3.6 ⑤ 每日投资报告

**触发**：每天定时（默认 21:00，时区 `Asia/Shanghai`，设置可改）。

**汇总指标**：

- 今日共分析 N  
- 值得研究 / 建议放弃 / 继续观察  
- 今日新增真正新方向（去重聚类后）

**每个入选项目摘要**：真实性星级、数据来源列表、竞争、开发难度、启动资金、预计 MVP 天数、建议指数、亮点一句。

---

### 3.7 页面交互规格（对齐原型）

#### 今日概览 `/dashboard`

- 四张统计卡 + 今日报告摘要 + 值得研究 Top 列表（点进详情）

#### 邮件流水 `/emails`

- 表格：时间、标题、发件人、分类 Tag、状态（已分析/已过滤/处理中）  
- 行点击 → Drawer 看正文摘要与提取链接  
- 筛选：分类、是否营销过滤

#### 项目卡片库 `/projects`

- 表格或卡片：Name、Type、Price、Audience、真实性、落地指数、建议  
- 筛选：verdict、cluster

#### 项目详情 `/projects/:id`

分区展示：解析摘要 → Card 字段 → 证据列表 → 竞争/热度 → 评分雷达或维度条 → MVP 周计划。

#### 每日报告 `/reports`

- 左侧日期列表，右侧报告正文结构（可用 Markdown 渲染）

#### Agent 流水线 `/pipeline`

- 五层节点状态：queued / running / done / skipped / failed  
- 最近任务时间线

#### 设置 `/settings`

- Gmail 授权（后续真实 OAuth；原型禁用）  
- 营销关键词编辑  
- 报告生成时间  
- 验证源开关（后续）

#### 个人中心 `/profile`

- 展示当前用户（原型假数据即可）

---

## 第四章：超越竞品的差异化

| 点 | 结构原因 |
|----|----------|
| 证据型验真 | 邮件/Newsletter 水分高；无检索约束的 LLM 必幻觉 |
| 「能不能做」评分 | 投资日报常评市场，不评个人约束 |
| 营销过滤 + 聚类 | 收件箱噪声与同质赛道刷屏是刚需 |
| 强制 MVP 周计划 | 把研究闭环到可执行动作 |

---

## 第五章：数据模型

> 表名建议统一前缀 `research_`。均含 `tenant_id`、`created_at`、`updated_at`。

### 5.1 research_gmail_accounts

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid | PK |
| tenant_id | uuid | |
| email | varchar | |
| refresh_token_enc | text | 加密 |
| sync_cursor | varchar | HistoryId / 页标记 |
| status | enum | active / revoked |

### 5.2 research_emails

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid | |
| tenant_id | uuid | |
| gmail_message_id | varchar | 唯一 |
| subject | text | |
| from_addr | varchar | |
| received_at | timestamptz | |
| body_text | text | |
| extracted_json | jsonb | 链接等 |
| categories | text[] | |
| status | enum | pending/parsing/filtered/… |
| filter_reason | varchar | nullable |

### 5.3 research_projects

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid | |
| tenant_id | uuid | |
| email_id | uuid | FK |
| cluster_id | uuid | nullable |
| card_json | jsonb | Project Card |
| verify_status | enum | |
| feasibility_index | int | |
| verdict | enum | do/watch/skip |
| authenticity_stars | int | 1–5 |
| lifecycle | varchar | |
| mvp_plan_json | jsonb | |

### 5.4 research_evidences

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid | |
| project_id | uuid | |
| source | varchar | |
| url | text | |
| claim | varchar | |
| value | text | |
| snippet | text | |
| fetched_at | timestamptz | |

### 5.5 research_competitors / research_heat_points

竞争者一行一条；热度按 `project_id + date + metric` 存点，供图表。

### 5.6 research_clusters

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid | |
| tenant_id | uuid | |
| key | varchar | 如 ai_ppt |
| label | varchar | AI PPT |
| project_ids | uuid[] | 或关系表 |

### 5.7 research_daily_reports

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid | |
| tenant_id | uuid | |
| report_date | date | 唯一/租户 |
| summary_json | jsonb | 计数 |
| body_md | text | |
| project_ids | uuid[] | |

### 5.8 research_pipeline_jobs

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid | |
| tenant_id | uuid | |
| email_id / project_id | uuid | |
| stage | enum | parse/identify/verify/score/report |
| status | enum | |
| error | text | |
| started_at / finished_at | timestamptz | |

---

## 第六章：技术架构

```
web-research (Vite React)     web (闲鱼)
        \                       /
         \                     /
          ▼                   ▼
           NestJS /api
           ├── /api/auth          (共用)
           ├── /api/...           (闲鱼现有)
           └── /api/research/*    (研究域)
                    ├── Gmail sync (Bull)
                    ├── Agent workers
                    └── 搜索适配器
```

- 队列：复用现有 Bull + Redis  
- LLM：复用现有 AI 模块配置思路（OpenAI 兼容），研究域单独 system prompt  
- 搜索：适配器模式 `SearchProvider`（Google CSE / SerpAPI / 自建爬虫等），实现可替换  

### 6.1 环境变量（后续）

```env
# Gmail
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# 搜索
SEARCH_PROVIDER=serp|mock
SERPAPI_KEY=

# 研究
RESEARCH_REPORT_CRON=0 21 * * *
RESEARCH_TZ=Asia/Shanghai
```

---

## 第七章：交互细节

- 验证中项目详情页显示「证据收集中」，禁止提前展示最终评分  
- 过滤邮件在列表用灰色 Tag「垃圾营销」，不可进项目库  
- 同簇项目在卡片上显示「同簇 N 个」  
- 流水线失败提供「重试」按钮（调 `POST /api/research/jobs/:id/retry`）  
- 设置页保存营销词后，仅对**新邮件**生效（历史可提供「重新过滤」任务）

---

## 第八章：导出与输出

- 日报：站内 Markdown + 后续可选 Webhook / 邮件推送  
- 项目 Card：JSON 导出（P2）  
- 证据包：按项目打包 URL 列表（审计用，P2）

---

## 第九章：开发优先级

### P0（可闭环）

1. Gmail OAuth + 增量拉信入库  
2. 营销过滤 + 基础分类  
3. 项目识别 → Card  
4. 验证：Mock 或 3 源（GitHub + PH + 通用搜索）  
5. 落地评分 + MVP 周计划  
6. 日报生成与列表  
7. 前端接真 API，替换 Mock  

### P1

- 完整搜索源、竞争分析、热度序列图、聚类、过时判断  
- 流水线可视化接真任务  
- 验证源开关  

### P2

- SSO 与闲鱼同域登录  
- Webhook 推送、导出、多邮箱  

---

## 第十章：性能指标

| 指标 | 目标 | 降级 |
|------|------|------|
| 单日 50 封邮件端到端 | < 30 min（含验证） | 验证并发降低、源减少 |
| 单项目验证 | < 3 min | degraded + 降权 |
| 日报准时率 | > 95% | 延迟告警 |
| API p95（列表） | < 300ms | 加索引/缓存 |

---

## 第十一章：开发者交接说明

你实现逻辑时请：

a) **只在 `/api/research` 下加路由**，不要污染闲鱼模块。  
b) **验证层**：无 URL/无抓取结果不得写入具体数字事实。  
c) **先让状态机与表结构跑通**，搜索适配器可先 `mock`。  
d) **已知的未知项**：各第三方 API 配额与 ToS、Gmail 敏感范围审核、搜索反爬。  
e) **验收脚本（逻辑就绪后）**：

1. 授权测试 Gmail → 收件箱出现测试 Newsletter → 邮件列表可见  
2. 标题含 `Get Rich` → 状态 filtered  
3. 正常产品邮件 → 生成 Card → 证据表至少 1 条真实 URL  
4. 评分与 MVP 周计划非空  
5. 触发日报（或等到 cron）→ `/reports` 可见当日汇总  
6. `GET /api/research/health` 返回 `zone: research`

### 本期仓库对应关系

| 路径 | 说明 |
|------|------|
| `web-research/` | UI 原型 |
| `web/src/layouts/MainLayout.tsx` | 闲鱼端系统切换 |
| `server/src/modules/research/` | 项目区占位 |
| `docs/project-research-system.md` | 本文档 |

---

## 附录 A：API 契约草案

> 除 `GET /health` 外，均需 JWT。前缀：`/api/research`。

### A.1 Health（已实现占位）

`GET /api/research/health`

```json
{ "ok": true, "zone": "research", "timestamp": "2026-07-21T13:00:00.000Z" }
```

### A.2 Gmail

- `GET /gmail/auth-url` → `{ url }`  
- `GET /gmail/callback?code=` → 写账号后重定向前端设置页  
- `GET /gmail/status` → `{ connected, email, lastSyncAt }`  
- `POST /gmail/sync` → 触发增量同步任务 `{ jobId }`

### A.3 Emails

- `GET /emails?status=&category=&page=&pageSize=`  
- `GET /emails/:id`

### A.4 Projects

- `GET /projects?verdict=&clusterId=&page=`  
- `GET /projects/:id` → 含 evidences、competitors、heatSeries、mvpPlan、scoreDimensions  
- `POST /projects/:id/reverify`  
- `POST /projects/:id/rescore`

### A.5 Reports

- `GET /reports?from=&to=`  
- `GET /reports/:date`  
- `POST /reports/generate` → 手动生成当日（调试用）

### A.6 Pipeline

- `GET /jobs?status=&stage=`  
- `GET /jobs/:id`  
- `POST /jobs/:id/retry`

### A.7 Settings

- `GET /settings`  
- `PUT /settings`  
  body 示例：

```json
{
  "marketingKeywords": ["Get Rich", "Passive Income"],
  "reportCronLocal": "21:00",
  "enabledVerifySources": ["google", "github", "producthunt", "reddit"]
}
```

### A.8 项目详情响应示例

```json
{
  "id": "proj_clipmagic",
  "card": {
    "name": "ClipMagic",
    "type": "AI Video",
    "price": "$29/月",
    "audience": "YouTube Creator",
    "openSource": false,
    "website": "https://example.com",
    "launchYear": 2026
  },
  "authenticityStars": 4,
  "feasibilityIndex": 92,
  "verdict": "do",
  "evidences": [
    {
      "source": "github",
      "url": "https://github.com/example/clipmagic",
      "claim": "stars",
      "value": "320",
      "snippet": "…"
    }
  ],
  "competitors": {
    "count": 12,
    "topPlayers": ["Gamma", "Beautiful.ai", "Canva"]
  },
  "lifecycle": "growing",
  "mvpPlan": [
    { "week": 1, "items": ["完成登录"] },
    { "week": 2, "items": ["完成支付"] },
    { "week": 3, "items": ["接入模型"] },
    { "week": 4, "items": ["上线"] }
  ]
}
```

---

## 附录 B：Mock 故事线（原型已覆盖）

1. **营销垃圾**：标题含 Get Rich → 邮件状态 filtered  
2. **AI PPT 簇**：多封邮件聚类为同一方向，日报「真正新方向」计 1  
3. **高分可做**：ClipMagic 类，落地指数高、建议做  
4. **红海放弃**：AI PPT 类，lifecycle=saturated，verdict=skip  

实现真实逻辑时应用集成测试复现上述四条路径。
