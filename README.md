# 闲鱼虚拟产品自动发货工具

> 基于 mtop 协议逆向的闲鱼虚拟商品（卡密/链接/文本）云端自动发货 SaaS 工具。

## 功能概览

| 功能 | 说明 |
|------|------|
| 🔐 多账号管理 | 添加多个闲鱼账号，Cookie AES-256-GCM 加密存储 |
| 📦 商品规则配置 | 按商品 ID 绑定发货策略：卡密池 / 固定链接 / 固定文本 |
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
| 前端 | React 18 + Vite + Ant Design 5 |
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
| Web 控制台 | http://localhost:5173 |
| 后端 API | http://localhost:3000 |
| API 文档 | http://localhost:3000/api (Swagger，暂未集成) |

### 5. 本地开发（不使用 Docker）

```bash
# 1. 先启动 PostgreSQL + Redis
docker compose up -d postgres redis

# 2. 启动后端
cd server
# 可选：如需为后端单独覆盖配置，再复制并修改 server/.env
# cp ../.env .env
npm install
npm run start:dev        # 监听 :3000

# 3. 启动前端（新终端）
cd web
npm install
npm run dev              # 监听 :5173
```

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
Tool/
├── docker-compose.yml          # 容器编排
├── .env.example                 # 环境变量模板
├── .env                         # 实际配置（不入 Git）
│
├── server/                      # 后端 (NestJS)
│   ├── src/
│   │   ├── main.ts              # 入口
│   │   ├── app.module.ts        # 根模块
│   │   ├── config/              # 配置管理
│   │   ├── common/              # 公共：Entity 基类、Guard、Filter、Interceptor、工具
│   │   ├── xianyu/              # 闲鱼协议层
│   │   │   ├── interfaces.ts    # ISignProvider、MtopRequestContext 等
│   │   │   ├── mtop-client.ts   # mtop HTTP 调用客户端
│   │   │   ├── xianyu.module.ts # 协议模块（组装签名 Provider + API）
│   │   │   ├── providers/       # 签名实现：Mock / HTTP / Native
│   │   │   └── apis/            # 业务 API 封装：订单、消息、发货确认
│   │   └── modules/             # 业务模块
│   │       ├── auth/            # 认证（注册/登录/JWT）
│   │       ├── users/           # 用户管理
│   │       ├── accounts/        # 闲鱼账号管理
│   │       ├── products/        # 商品发货规则
│   │       ├── kami-pool/       # 卡密池
│   │       ├── orders/          # 订单
│   │       ├── delivery/        # 发货引擎 + 日志 + 定时调度
│   │       └── sign/            # 签名服务监控
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
└── web/                         # 前端 (React + Vite + AntD)
    ├── src/
    │   ├── App.tsx              # 路由
    │   ├── api/index.ts         # Axios 封装
    │   ├── layouts/MainLayout.tsx
    │   └── pages/               # Dashboard / Accounts / Products / KamiPool / Orders
    ├── Dockerfile
    ├── package.json
    └── vite.config.ts
```

## 常见问题

### Q: 启动后访问 Web 控制台 404？

Docker 首次启动需要构建镜像和安装依赖，约需 1~2 分钟。可通过 `docker compose logs -f web` 查看启动日志。

### Q: 如何获取闲鱼账号的 Cookie？

1. 手机端打开闲鱼 App
2. 使用抓包工具（Charles / mitmproxy）抓取 `h5api.m.goofish.com` 的请求
3. 复制完整的 Cookie 头（需包含 `_m_h5_tk` 等关键字段）

### Q: Mock 模式能真正发货吗？

不能。Mock 模式的签名是假的，mtop 网关会拒绝请求。Mock 模式仅用于：
- 前后端联调
- 发货引擎逻辑验证
- 界面功能测试

要真正发货，需切换为 `http` 或 `native` 签名模式并接入真实的签名服务。

### Q: mtop 接口名和参数准确吗？

当前使用的是基于公开信息的接口名估算值（如 `mtop.taobao.idle.trade.order.list`）。实际接口名和参数可能不同，需要通过真实抓包确认后修改 `server/src/xianyu/apis/` 下的对应文件。

### Q: 生产环境部署注意事项？

1. **关闭自动建表**：设置 `DB_SYNC=false`，使用 TypeORM Migration
2. **切换签名模式**：`SIGN_PROVIDER=http` 或 `native`
3. **关闭 Mock 订单**：`ORDER_MOCK_MODE=false`
4. **强化安全**：修改所有默认密码、使用强 JWT_SECRET、配置 HTTPS
5. **数据备份**：配置 MySQL 定期备份

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
- [ ] 真实签名服务对接（需自行研究 mtop 签名算法或接入第三方）
- [ ] 真实 mtop 接口抓包验证与参数修正
- [ ] WebSocket 实时推送订单状态
- [ ] 多租户管理后台（创建租户、分配账号）
- [ ] Docker 生产镜像优化（multi-stage build）
- [ ] CI/CD 自动化部署

## License

MIT
