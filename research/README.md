# 邮件分析 / 项目研究系统

| 目录 | 说明 |
|------|------|
| [`server/`](server/) | Go + Gin API（海外部署，直连 Google） |
| [`web/`](web/) | React 前端（CF Pages：email-analysis） |
| [`deploy/`](deploy/) | Docker Compose + `.env.example` + `deploy.sh` |

本地：

```bash
# API
cd server && cp .env.example .env && go run ./cmd/api

# Web（代理 /api → :8080）
cd web && npm ci && npm run dev
```

生产：见根目录 README「研究系统海外部署」与 `.github/workflows/cd-research-api.yml`。
