#!/usr/bin/env bash
# ============================================================
# Cloudflare Tunnel 一键说明（国内阿里云 + CF Pages 免备案）
#
# 作用：让 api.子域名 经 CF 隧道访问本机 localhost:14277，
#       避免「域名直解析国内 IP 未备案 → 503」。
#
# 用法：bash scripts/setup-cloudflare-tunnel.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}>>>${NC} $*"; }
warn() { echo -e "${YELLOW}!!!${NC} $*"; }

cat <<'EOF'

╔══════════════════════════════════════════════════════════════╗
║  Cloudflare Tunnel 配置步骤（约 10 分钟）                      ║
╚══════════════════════════════════════════════════════════════╝

【1】Cloudflare 控制台创建 Tunnel
  1. 打开 https://one.dash.cloudflare.com/
  2. 左侧 Networks → Connectors → Cloudflare Tunnels
  3. Create a tunnel → 名称填 xy-tool-api → Save
  4. 选 Docker 安装，复制那一长串 --token eyJh...（即 TUNNEL_TOKEN）

【2】配置公网域名（Public Hostname）
  仍在该 Tunnel 页面 → Public Hostname → Add：
    Subdomain : api
    Domain    : skyed.dpdns.org   （换成你的域名）
    Type      : HTTP
    URL       : localhost:14277   （本机 API 端口，与 SERVER_HOST_PORT 一致）

  保存后 CF 会自动添加 CNAME，不要用 A 记录指到阿里云 IP！

【3】删除旧的 A 记录（重要）
  skyed.dpdns.org → DNS → 删除 api 的 A 记录（指向 120.27.20.115 那条）
  只保留 Tunnel 自动创建的 CNAME（橙云即可）

【4】服务器写入 Token
  编辑 /opt/xianyu-tool/.env.prod ，增加一行：
    CLOUDFLARE_TUNNEL_TOKEN=eyJh...（粘贴完整 token）

【5】启动 Tunnel 容器
  cd /opt/xianyu-tool
  docker compose --env-file .env.prod -f docker-compose.prod.yml --profile tunnel up -d

  查看日志：
    docker logs -f xianyu-cloudflared

【6】验证隧道
  浏览器打开（应返回 JSON，不是 503）：
    https://api.skyed.dpdns.org/api/health

【7】更新 GitHub Variable
  仓库 Settings → Variables：
    BACKEND_URL = https://api.skyed.dpdns.org
  （HTTPS，不要端口，不要 IP）

【8】重新部署前端
  GitHub Actions → CD → Re-run Deploy Frontend to Cloudflare

【9】确认 CORS（服务器 .env.prod）
    CORS_ORIGIN=https://xy.skyed.dpdns.org   （你的前端域名）

  重启 API：
    docker compose --env-file .env.prod -f docker-compose.prod.yml up -d server

【可选】阿里云安全组可关闭公网 14277（API 只走隧道更安全）

EOF

warn "若 Zero Trust 提示未启用，按页面引导免费开通即可（个人用量免费）。"
