# 闲鱼虚拟产品自动发货工具 + 邮件分析（项目研究）系统

> 本仓库包含两个独立产品，目录已按产品拆分。

| 产品 | 目录 | 后端 | 部署 |
|------|------|------|------|
| 闲鱼自动发货 | `xianyu/server` · `xianyu/web` | NestJS（国内机） | `cd-server` / `cd-web` |
| 邮件分析 / 项目研究 | `research/server` · `research/web` | **Go + Gin（海外机，直连 Google）** | `cd-research-api` / `cd-research` |

研究系统规格见 [`docs/project-research-system.md`](docs/project-research-system.md)。

---

## 闲鱼自动发货

> 基于 mtop 协议逆向的闲鱼虚拟商品（卡密/链接/文本）云端自动发货 SaaS 工具。

## 功能概览

| 功能 | 说明 |
|------|------|
| 🔐 多账号管理 | 添加多个闲鱼账号，Cookie AES-256-GCM 加密存储 |
| 📦 商品规则配置 | 按商品 ID 绑定发货策略：卡密池 / 固定链接 / 固定文本 / 激活码+网盘 |
| 🎫 卡密池管理 | 批量导入卡密，悲观锁防超发，低库存预警 |
| 🚀 自动发货 | 定时轮询订单 → 自动匹配规则 → 通过闲鱼 IM 发货给买家 |
| 🔄 失败重试 | 指数退避重试（最多 3 次），发货日志全程可追溯 |
| 👥 多租户隔离 | 共享数据库，JWT 携带 tenantId 实现数据隔离 |
| 🔌 可插拔签名 | Mock / HTTP 第三方 / Native 自研三种签名模式，环境变量一键切换 |
| 📊 Web 控制台 | React + Ant Design，仪表盘、账号、商品、卡密、订单全管理 |

## 系统架构

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│  闲鱼 App   │     │              闲鱼 mtop 网关              │
│  (买家下单)  │◄───►│    h5api.m.goofish.com                  │
└─────────────┘     └──────────────▲───────────────────────────┘
                                   │ HTTPS (签名请求)
┌─────────────┐     ┌──────────────┴───────────────────────────┐
│  Web 控制台  │────►│            后端 API (NestJS)             │
│  React+AntD │◄───►│  ┌──────────────────────────────────┐    │
│  :5173      │     │  │ 定时调度器 (每 5s)                 │    │
└─────────────┘     │  │  ├─ 拉取新订单 (OrderApi)          │    │
                    │  │  ├─ 发货引擎 (DeliveryService)    │    │
                    │  │  └─ 释放过期锁 (KamiPoolService)  │    │
                    │  └──────────────────────────────────┘    │
                    │                                          │
                    │  ┌─────────┐  ┌──────────┐  ┌─────────┐  │
                    │  │ 签名层  │  │ 业务模块  │  │ Auth    │  │
                    │  │ ISign   │  │ Accounts │  │ Users   │  │
                    │  │ Provider│  │ Products │  │ JWT     │  │
                    │  │ ┌─────┐│  │ KamiPool │  │ Guard   │  │
                    │  │ │Mock ││  │ Orders   │  │         │  │
                    │  │ │HTTP ││  │ Delivery │  │         │  │
                    │  │ │Native││  │          │  │         │  │
                    │  │ └─────┘│  │          │  │         │  │
                    │  └────┬────┘  └────┬─────┘  └─────────┘  │
                    │       │            │                       │
                    └───────┼────────────┼───────────────────────┘
                            │            │
                    ┌────────────┐  ┌──────────┐
                    │ PostgreSQL │  │ Redis 7  │
                    │  (数据持久化) │  │ (预留队列) │
                    └────────────┘  └──────────┘
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | NestJS 10 + TypeScript |
| 数据库 | PostgreSQL 16 (TypeORM) |
| 缓存 | Redis 7 (预留) |
| 认证 | Passport + JWT |
| 加密 | AES-256-GCM (scrypt 密钥派生) |
| 前端 | React 18 + Vite + Ant Design 5（闲鱼 `xianyu/web` :5173；研究 `research/web` :5174） |
| 研究后端 | Go + Gin + GORM + Postgres（`research/server`，默认 :8080） |
| 部署 | Docker Compose |

## 快速开始

### 前置条件

- Docker Desktop（含 Docker Compose）
- Node.js 18+（本地开发可选）

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd Tool
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，关键配置项：

```env
# 必须修改
JWT_SECRET=your_long_random_secret_here
COOKIE_ENCRYPTION_KEY=<64字符hex密钥>   # 生成方式见下方

# 签名服务（开发用 mock，生产切换为 http 或 native）
SIGN_PROVIDER=mock

# 是否开启 Mock 订单模式（联调用）
ORDER_MOCK_MODE=true
```

**生成 Cookie 加密密钥：**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 一键启动

```bash
docker compose up -d
```

首次启动会自动：
- 创建 PostgreSQL / Redis 容器
- 安装前后端依赖
- 自动建表（`DB_SYNC=true`）

等待 1~2 分钟，服务就绪。

### 4. 访问

| 服务 | 地址 |
|------|------|
| 闲鱼 Web 控制台 | http://localhost:5173 |
| 项目研究系统（UI 原型） | http://localhost:5174 |
| 后端 API | http://localhost:3000 |
| API 文档 (Swagger) | http://localhost:3000/api/docs |
| 健康检查 | http://localhost:3000/api/health |
| 研究域占位 | http://localhost:3000/api/research/health |

顶栏左侧有「管理系统切换」下拉，可在两个前端之间跳转。研究系统功能规格见 [`docs/project-research-system.md`](docs/project-research-system.md)。

### 5. 本地开发（不使用 Docker）

```bash
# 1. 先启动 PostgreSQL + Redis
docker compose up -d postgres redis

# 2. 启动闲鱼后端
cd xianyu/server
npm install
npm run start:dev        # 监听 :3000

# 3. 启动闲鱼前端（新终端）
cd xianyu/web
cp .env.example .env.local   # 可选：配置 VITE_SISTER_APP_URL
npm install
npm run dev                  # 监听 :5173

# 4. 启动研究系统（海外能力本地也可跑）
# 4a. Postgres（可用 research/deploy 或本机）
cd research/deploy && cp .env.example .env   # 改 DB_PASSWORD 等
# 仅起库：docker compose up -d postgres

# 4b. Go API
cd research/server
cp .env.example .env         # DATABASE_* / JWT_*
go run ./cmd/api             # 监听 :8080

# 4c. 研究前端
cd research/web
cp .env.example .env.local
npm install
npm run dev                  # 监听 :5174，/api 代理到 :8080
```

| 环境变量 | 包 | 说明 |
|----------|-----|------|
| `VITE_SISTER_APP_URL` | `xianyu/web` | 本地默认 `http://localhost:5174`；生产由 CD 注入 `RESEARCH_WEB_URL` |
| `VITE_SISTER_APP_URL` | `research/web` | 本地默认 `http://localhost:5173`；生产由 CD 注入 `XY_WEB_URL` |
| `RESEARCH_WEB_URL` / `XY_WEB_URL` | GitHub Variables | 两边前端互相跳转的线上域名 |
| `VITE_API_BASE_URL` / `RESEARCH_API_BASE_URL` | 研究前端 CD | 生产指向海外 Go API，如 `https://research-api.xxx/api` |

## 生产部署（CI/CD）

本项目内置完整的 CI/CD 流水线，push 到 main 分支后自动：**构建镜像 → 推送 GHCR → SSH 部署到服务器 → 健康检查**。

### 部署架构

```
push main
  ↓
CI（ci.yml）：install → build → test
  ↓
CD（cd.yml）：
  1. docker build server + web（multi-stage）
  2. push ghcr.io/<owner>/<repo>-{server,web}:{latest,sha}
  3. SSH 登服务器：docker compose pull + up -d
  4. curl /api/health 验证
```

### 首次部署（3 步）

**第 1 步：服务器初始化**

在全新 Linux 服务器上执行（装 Docker + 建目录 + 登录 GHCR）：

```bash
# 下载初始化脚本（或从仓库 scripts/server-init.sh 复制）
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/server-init.sh | bash
```

**第 2 步：配置生产环境变量**

编辑服务器上的 `/opt/xianyu-tool/.env.prod`（参考 `.env.prod.example`），必填项：

```bash
cd /opt/xianyu-tool
# 生成密钥
openssl rand -hex 32        # → JWT_SECRET / JWT_REFRESH_SECRET
openssl rand -base64 24     # → DB_PASSWORD / REDIS_PASSWORD
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # → COOKIE_ENCRYPTION_KEY

# 编辑 .env.prod 填入上述密钥 + IMAGE_OWNER/IMAGE_REPO
vi .env.prod
```

把仓库的 `docker-compose.prod.yml` 和 `scripts/deploy.sh` 复制到 `/opt/xianyu-tool/`。

**第 3 步：配置 GitHub Secrets**

在仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret | 说明 |
|--------|------|
| `SSH_HOST` | 服务器 IP/域名 |
| `SSH_USER` | SSH 用户名（如 root） |
| `SSH_KEY` | SSH 私钥完整内容 |

并在 **Settings → Variables**（注意是 Variables 不是 Secrets）添加：
- `ENABLE_DEPLOY=true`（开启自动部署）
- `DEPLOY_DIR=/opt/xianyu-tool`（可选，默认值）

### 日常部署

配置完成后，**每次 push main 分支自动部署**。也可在 Actions 页面手动触发 `CD` workflow。

部署后访问：
- Web 控制台：`http://<服务器IP>` （80端口，nginx）
- API：`http://<服务器IP>:3000/api`
- 健康检查：`http://<服务器IP>:3000/api/health`
- Swagger 文档：`http://<服务器IP>:3000/api/docs`

### 手动部署与回滚

在服务器上：

```bash
cd /opt/xianyu-tool
bash scripts/deploy.sh deploy            # 手动部署最新镜像
bash scripts/deploy.sh status            # 查看运行状态
bash scripts/deploy.sh rollback <sha>    # 回滚到指定版本（sha 前7位）
```

### 生产配置要点

- **数据库 migration 自动执行**：server 启动时 `DB_MIGRATIONS_RUN=true` 自动跑未执行的 migration
- **生产关闭自动建表**：`DB_SYNC=false`，结构变更必须通过 migration
- **Cookie 保活**：默认每 6 小时自动续期（`COOKIE_RENEW_ENABLED=true`）
- **数据库/Redis 端口不暴露公网**：生产 compose 注释了端口映射，仅容器内访问
- **镜像版本追溯**：每次构建打 `:latest`（滚动）和 `:<sha>`（版本）双 tag，支持回滚

## 配置参考

完整环境变量列表（参见 `.env.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3000` | 后端监听端口 |
| `DB_HOST` | `postgres` | PostgreSQL 主机 |
| `DB_PORT` | `5433` | PostgreSQL 端口（宿主机访问） |
| `DB_USERNAME` | `xianyu` | PostgreSQL 用户名 |
| `DB_PASSWORD` | `xianyu_dev_password` | PostgreSQL 密码 |
| `DB_DATABASE` | `xianyu_autodeliver` | 数据库名 |
| `DB_SYNC` | `true` | 自动建表（生产请关闭） |
| `REDIS_HOST` | `redis` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | _(空)_ | Redis 密码 |
| `JWT_SECRET` | _(必填)_ | JWT 签名密钥 |
| `JWT_EXPIRES_IN` | `7d` | Token 有效期 |
| `COOKIE_ENCRYPTION_KEY` | _(必填)_ | Cookie 加密密钥（64 hex） |
| `SIGN_PROVIDER` | `mock` | 签名模式：`mock` / `http` / `native` |
| `SIGN_HTTP_URL` | _(空)_ | HTTP 签名服务地址 |
| `SIGN_HTTP_TOKEN` | _(空)_ | HTTP 签名服务鉴权 Token |
| `ORDER_POLL_INTERVAL_MS` | `15000` | 订单轮询间隔（毫秒） |
| `ORDER_MOCK_MODE` | `true` | 是否生成 Mock 订单 |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS 允许的源 |

## API 接口

所有业务接口前缀 `/api`，需要 `Authorization: Bearer <JWT>` 请求头。

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（username, password） |
| POST | `/api/auth/login` | 登录，返回 JWT |

### 闲鱼账号

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/accounts` | 列出租户下所有账号 |
| POST | `/api/accounts` | 新增账号（nickname, xianyuUid, cookie） |
| PUT | `/api/accounts/:id/cookie` | 更新 Cookie |
| DELETE | `/api/accounts/:id` | 删除账号 |

### 商品规则

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/products` | 列出所有商品规则 |
| GET | `/api/products/account/:accountId` | 列出指定账号的商品 |
| POST | `/api/products` | 创建规则（accountId, itemId, title, deliveryType, ...） |
| PUT | `/api/products/:id` | 更新规则 |
| DELETE | `/api/products/:id` | 删除规则 |

**deliveryType** 取值：
- `kami` — 卡密发货，需绑定 `kamiPoolId`
- `link` — 固定链接发货，需填 `fixedContent`
- `text` — 固定文本发货，需填 `fixedContent`
- `license` — 激活码发货，需填 `licenseTypeCode` + `fixedContent`（网盘/下载地址）

**license 发货消息格式**（IM 发给买家）：
```
SWA-A3F2-9KX1-MN7P
---
https://pan.baidu.com/s/xxx 提取码：xxxx
---
附言内容（如有）
```

### 激活码（License）

管理端（需 JWT 登录）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/license/manage/types` | 列出激活码类型（含库存数） |
| POST | `/api/license/manage/types` | 创建类型（name, code, durationDays?, maxUses?, codePrefix?） |
| PUT | `/api/license/manage/types/:id` | 更新类型 |
| DELETE | `/api/license/manage/types/:id` | 删除类型（无码时） |
| POST | `/api/license/manage/batches/generate` | 批量预生成激活码 |
| GET | `/api/license/manage/codes` | 激活码列表（分页） |
| POST | `/api/license/manage/codes/:id/revoke` | 作废激活码 |

对外验证 API（供 Codex 安装器等客户端调用，**无需闲鱼登录**）：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/license/verify` | 验证并消费激活码，请求头需 `X-API-Key` |

```bash
curl -X POST https://your-api-domain/api/license/verify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_LICENSE_API_KEY" \
  -d '{"code":"SWA-A3F2-9KX1-MN7P","activatedBy":"device-xxx"}'
```

**环境变量**（`.env` / `.env.prod`）：
- `LICENSE_API_KEY` — 对外验证 API 密钥，未配置时 `/api/license/verify` 返回 401

**数据库迁移**：生产环境需执行 `0005_add_license_tables`（添加 `license_*` 表及 `products.license_type_code` 列）。

**Mock 测试**：`ORDER_MOCK_MODE=true` 时会轮换生成 `mock_item_license_001` 等 mock 订单；需先创建对应商品规则（激活码类型 + `itemId=mock_item_license_001`）。

### 卡密池

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/kami/pools` | 列出所有卡密池 |
| POST | `/api/kami/pools` | 创建卡密池（name, remark?） |
| DELETE | `/api/kami/pools/:id` | 删除卡密池 |
| GET | `/api/kami/items/:poolId` | 列出池内卡密 |
| GET | `/api/kami/stock/:poolId` | 查询可用库存数 |
| POST | `/api/kami/items/:poolId` | 批量添加卡密（contents: string[]） |
| DELETE | `/api/kami/items/:id` | 删除单条卡密 |
| GET | `/api/kami/low-stock` | 查询低库存预警 |

### 订单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/orders` | 订单列表（分页 page/size） |
| GET | `/api/orders/stats` | 各状态订单计数 |

### 发货日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/delivery/logs` | 发货日志（分页，可按 orderId 过滤） |

### 签名服务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sign/health` | 签名服务健康检查 |
| GET | `/api/sign/info` | 当前签名提供者信息 |

## 核心设计

### 签名层（ISignProvider）

签名层是项目最核心的抽象。闲鱼 mtop 协议每次请求都需要 `x-sign`、`x-mini-wua`、`x-sgext` 三个签名字段，且算法不定期更新。因此设计为可插拔接口：

```
ISignProvider (接口)
    ├── MockSignProvider      — 开发用，返回 MD5 假签名
    ├── HttpSignProvider      — 调第三方签名 API
    └── NativeSignProvider    — 调本地自研签名服务
```

通过 `SIGN_PROVIDER` 环境变量一键切换，业务代码无需任何修改。

### 发货状态机

```
PENDING ──► ASSIGNED ──► DELIVERING ──► DELIVERED
              │               │
              └─── 失败 ──────┘
                    │
              FAILED (重试 ≤ 3 次，指数退避)
```

- **PENDING**: 新订单，等待处理
- **ASSIGNED**: 已匹配商品规则，准备发货内容
- **DELIVERING**: 正在发送消息给买家
- **DELIVERED**: 发货成功
- **FAILED**: 发货失败（超过重试次数）

### 卡密防超发

使用 MySQL 悲观锁 `SELECT ... FOR UPDATE`，在事务中锁定卡密条目：

```
BEGIN
  SELECT * FROM kami_items WHERE poolId=? AND status='unused' LIMIT 1 FOR UPDATE
  UPDATE kami_items SET status='locked', orderId=?, lockedUntil=? WHERE id=?
COMMIT
```

如果发货失败，卡密会在锁超时后自动释放。

### Cookie 安全

闲鱼账号的 Cookie 使用 AES-256-GCM 加密后存入数据库：

1. 从环境变量读取 `COOKIE_ENCRYPTION_KEY`（64 hex = 32 字节）
2. 用 scrypt 派生出 32 字节加密密钥 + 16 字节 IV
3. AES-256-GCM 加密，authTag 随密文一起存储
4. 解密时验证 authTag，防止篡改

## 接入真实签名服务

### 方式一：HTTP 第三方签名 API

```env
SIGN_PROVIDER=http
SIGN_HTTP_URL=https://your-sign-service.com/sign
SIGN_HTTP_TOKEN=your_api_token
```

第三方签名服务需实现以下接口：

```json
POST /sign
Request:  { "apiName": "...", "version": "...", "timestamp": 1234, "appKey": "...", "token": "...", "data": {...}, "userAgent": "..." }
Response: { "xSign": "...", "xMiniWua": "...", "xSgext": "..." }
```

### 方式二：Native 自研签名服务

```env
SIGN_PROVIDER=native
```

默认连接 `http://127.0.0.1:9090`，需自行部署签名服务并实现与 HTTP 相同的签名接口。

## 项目结构

```
xy-Tool/
├── xianyu/                      # 闲鱼自动发货
│   ├── server/                  # NestJS API
│   └── web/                     # React 控制台 :5173
├── research/                    # 邮件分析 / 项目研究
│   ├── server/                  # Go + Gin API :8080
│   ├── web/                     # React 前端 :5174
│   └── deploy/                  # 海外 Docker Compose + deploy.sh
├── infra/                       # 闲鱼部署脚本 / nginx 反代片段
├── cf-workers/google-proxy/     # （可选）国内机访问 Google 的备用代理；海外可不部署
├── docs/
├── docker-compose.yml           # 闲鱼本地编排
└── docker-compose.prod.yml      # 闲鱼国内生产编排
```

## 研究系统海外部署（摘要）

1. 海外机安装 Docker，目录例如 `/opt/research-api`
2. 复制 `research/deploy/docker-compose.yml`、`deploy.sh`，按 `.env.example` 建 `.env`
3. GitHub：`ENABLE_RESEARCH_DEPLOY=true`，Secrets `RESEARCH_SSH_*`，Variable `RESEARCH_DEPLOY_DIR`
4. Google 控制台回调改为海外 API：`https://<你的研究API域>/api/research/gmail/callback`
5. Pages 构建变量 `RESEARCH_API_BASE_URL=https://<你的研究API域>/api`

## 常见问题

### Q: 启动后访问 Web 控制台 404？

Docker 首次启动需要构建镜像和安装依赖，约需 1~2 分钟。可通过 `docker compose logs -f web` 查看启动日志。

### Q: 如何获取闲鱼账号的 Cookie？

1. 手机端打开闲鱼 App
2. 使用抓包工具（Charles / mitmproxy）抓取 `h5api.m.goofish.com` 的请求
3. 复制完整的 Cookie 头（需包含 `_m_h5_tk` 等关键字段）

### Q: 为什么扫码登录一天就过期？如何保活？

闲鱼扫码默认是「短登录」，核心 Cookie（`cookie2`/`sgcookie`）约 24 小时过期。本项目内置了 **Cookie 长登录保活**机制解决此问题：

- **自动保活**：每 6 小时自动调用闲鱼三步续期接口（`hasLogin.do` → `silentHasLogin.do` → `setLoginSettings.do`），以 `setLoginSettings` 返回 Set-Cookie 为成功标志，把有效期延长到 **7-30 天**（需 `SIGN_PROVIDER=goofish`，默认开启）
- **手动续期**：账号管理页每行有「续期」按钮，可立即刷新登录态
- **失败告警**：续期失败时自动推钉钉/企业微信告警，提示重新扫码
- **健康检查**：每 5 分钟探测登录态，过期自动标记并通知

相关配置（`.env`）：
```env
COOKIE_RENEW_ENABLED=true          # 开启自动保活
COOKIE_RENEW_CRON=0 */6 * * *      # 每 6 小时执行一次
```

> 若续期仍失败（如长时间未活跃被强制下线），点击「扫码更新」重新登录即可。

### Q: Mock 模式能真正发货吗？

不能。Mock 模式的签名是假的，mtop 网关会拒绝请求。Mock 模式仅用于：
- 前后端联调
- 发货引擎逻辑验证
- 界面功能测试

要真正发货，需切换为 `http` 或 `native` 签名模式并接入真实的签名服务。

### Q: mtop 接口名和参数准确吗？

当前使用的是基于公开信息的接口名估算值（如 `mtop.taobao.idle.trade.order.list`）。实际接口名和参数可能不同，需要通过真实抓包确认后修改 `server/src/xianyu/apis/` 下的对应文件。

### Q: 生产环境部署注意事项？

1. **关闭自动建表**：设置 `DB_SYNC=false`，使用 TypeORM Migration（`DB_MIGRATIONS_RUN=true`）
2. **切换签名模式**：`SIGN_PROVIDER=http` 或 `native`
3. **关闭 Mock 订单**：`ORDER_MOCK_MODE=false`
4. **强化安全**：修改所有默认密码、使用强 JWT_SECRET、配置 HTTPS
5. **数据备份**：配置 PostgreSQL 定期备份
6. **Web 部署**：用 `web/Dockerfile` 构建的多阶段镜像（nginx 托管），无需 Node 运行时

### Q: 如何成为 system 运营账号？

system 角色用于平台运营方，可访问 `/api/admin/*` 接口（租户列表/用量/封禁）。无法自助注册，需手动在 DB 升级：

```sql
UPDATE users SET role = 'system' WHERE username = 'your_admin_username';
```

升级后重新登录获取含 `role: system` 的 JWT，即可访问运营后台接口（Swagger 中「运营后台」分组）。

## 开发路线

- [x] Phase 1：项目脚手架 + Docker Compose + 配置管理
- [x] Phase 1：数据库表结构 + 实体定义
- [x] Phase 1：Auth 模块（注册/登录/JWT）
- [x] Phase 1：签名层抽象 + Mock Provider + mtop-client
- [x] Phase 2：闲鱼账号管理（Cookie 加密存取）
- [x] Phase 2：商品配置（虚拟品 → 发货规则）
- [x] Phase 2：卡密池管理（库存/预警）
- [x] Phase 2：发货执行引擎（状态机/幂等/重试）
- [x] Phase 3：订单监听 + Mock 产单 + 发货链路打通
- [x] Phase 4：前端最小控制台（React + AntD）
- [x] Phase 5：接入文档 + README
- [x] P0：DB Migration 完整迁移体系（data-source + 初始迁移 + CLI 命令 + 生产开关）
- [x] P0：登录限流/防刷（@nestjs/throttler 全局 + 登录/注册每分钟 5 次）
- [x] P0：Refresh Token + 401 自动无感续期（前端拦截器自动刷新）
- [x] P0：WebSocket 实时推送订单状态（新订单/状态变化/发货结果/低库存/账号过期）
- [x] P0：发货任务进 Bull 队列（Redis 持久化 + 并发消费 + 指数退避重试）
- [x] P1：退款闭环被动感知（IM 退款消息识别 + 状态机 REFUNDING/REFUNDED + mtop 不再丢弃退款单）
- [x] P1：告警通道（钉钉 / 企业微信机器人 webhook，发货失败/账号过期/低库存/订单卡住自动推送）
- [x] P1：个人中心（查看信息 / 修改昵称 / 修改密码并吊销旧会话）
- [x] P1：健康检查端点（/api/health，检查 DB+Redis，供 docker healthcheck 与探针使用）
- [x] P1：Swagger 全量 API 文档（/api/docs，所有接口+DTO 注解，支持 JWT 调试）
- [x] P2：prod Docker 镜像（web multi-stage + nginx 托管静态文件 + SPA fallback + /api 反代）
- [x] P2：单元测试框架（jest + ts-jest + @nestjs/testing，含卡密防超发/认证 2 个示例 spec）
- [x] P2：CI/CD（GitHub Actions，push main/master + PR 触发，server build+test、web build）
- [x] P2：统计报表（发货趋势/营收/商品销量 TOP，Dashboard 可视化）
- [x] P2：轻量运营后台（system 角色专用，租户列表/用量统计/封禁）
- [x] P3：关键词自动回复（精确/包含匹配，全局或指定账号）
- [x] P3：默认回复（兜底回复）
- [x] P3：AI 智能回复（OpenAI 兼容，带 Redis 上下文窗口、转人工、冷却）
- [x] P3：在售商品拉取（mtop.idle.web.xyh.item.list，一键导入为发货规则）
- [ ] 真实签名服务对接（需自行研究 mtop 签名算法或接入第三方）
- [ ] 真实 mtop 接口抓包验证与参数修正

## License

MIT
