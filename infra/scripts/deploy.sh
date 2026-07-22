#!/usr/bin/env bash
# ============================================================
# 闲鱼自动发货工具 - 部署/回滚脚本（在服务器上运行）
#
# 用法：
#   ./deploy.sh                    # 从 GHCR pull 后部署
#   ./deploy.sh deploy --skip-pull # 使用本地已 load 的镜像部署（CI 传包用）
#   ./deploy.sh rollback <sha>     # 回滚到指定 sha 的镜像
#   ./deploy.sh status             # 查看运行状态
#
# 前置：已在服务器配置好 .env.prod（IMAGE_OWNER/IMAGE_REPO/密钥等）
# ============================================================
set -euo pipefail

# 配置（SERVER_HOST_PORT 在加载 .env.prod 后设置 HEALTH_URL）
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_WAIT=45  # 健康检查最长等待秒数
HEALTH_INTERVAL=3

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $*"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ERROR:${NC} $*" >&2; }

# 切换到部署根目录（scripts/ 的上一级，应为 /opt/xianyu-tool）
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# 检查 .env.prod
if [ ! -f .env.prod ]; then
  err "未找到 .env.prod，请先复制 .env.prod.example 并填写真实值"
  exit 1
fi

# 加载环境变量（获取 IMAGE_OWNER / IMAGE_REPO）
# 关闭 glob，避免 COOKIE_RENEW_CRON 等含 */ 的值被 bash 展开
set -a
set -f
source .env.prod
set +f
set +a

if [ -z "${IMAGE_OWNER:-}" ] || [ -z "${IMAGE_REPO:-}" ]; then
  err ".env.prod 缺少 IMAGE_OWNER 或 IMAGE_REPO"
  exit 1
fi

# GHCR / Docker 镜像名必须小写（CI 构建时已转小写）
IMAGE_OWNER=$(echo "${IMAGE_OWNER}" | tr '[:upper:]' '[:lower:]')
IMAGE_REPO=$(echo "${IMAGE_REPO}" | tr '[:upper:]' '[:lower:]')
export IMAGE_OWNER IMAGE_REPO

SERVER_HOST_PORT="${SERVER_HOST_PORT:-14277}"
HEALTH_URL="http://localhost:${SERVER_HOST_PORT}/api/health"
export SERVER_HOST_PORT

ENV_FILE=".env.prod"
# docker compose 默认只读 .env，不读 .env.prod；必须显式传入
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# ============ 子命令 ============

cmd_deploy() {
  # CI 已通过 SCP + docker load 写入镜像时传 --skip-pull，避免国内机直拉 GHCR 极慢/超时
  local skip_pull=false
  if [ "${1:-}" = "--skip-pull" ] || [ "${SKIP_PULL:-}" = "1" ]; then
    skip_pull=true
  fi

  if [ "$skip_pull" = true ]; then
    log "跳过远程拉取（使用本地已 load 的镜像）"
    if ! docker image inspect "ghcr.io/${IMAGE_OWNER}/${IMAGE_REPO}-server:latest" >/dev/null 2>&1; then
      err "本地不存在 ghcr.io/${IMAGE_OWNER}/${IMAGE_REPO}-server:latest，无法 --skip-pull"
      exit 1
    fi
  else
    log "拉取 server 镜像..."
    compose pull server
  fi

  # 记录当前 server 镜像 digest（用于回滚）
  local cur_digest
  cur_digest=$(docker inspect --format='{{index .RepoDigests 0}}' \
    "ghcr.io/${IMAGE_OWNER}/${IMAGE_REPO}-server:latest" 2>/dev/null || echo "")
  if [ -n "$cur_digest" ]; then
    echo "$cur_digest" > .last-server-digest
    log "已记录上一版本: $cur_digest"
  fi

  log "启动服务..."
  # --pull never：postgres/redis 走本地镜像，避免国内 Docker Hub 超时
  compose up -d --remove-orphans --pull never

  log "等待服务健康（最长 ${HEALTH_WAIT}s）..."
  if wait_health; then
    log "✅ 部署成功，服务健康"
    cmd_status
  else
    err "❌ 健康检查失败，服务可能未正常启动"
    err "查看日志：compose logs --tail=50 server"
    warn "如需回滚：./deploy.sh rollback"
    exit 1
  fi
}

cmd_rollback() {
  local target_sha="${1:-}"
  if [ -z "$target_sha" ] && [ -f .last-server-digest ]; then
    # 回滚到上一版本
    log "使用记录的上一版本回滚..."
    # 通过 digest 重新打 latest 标签并重启
    local prev_digest
    prev_digest=$(cat .last-server-digest)
    err "回滚到记录的 digest: $prev_digest"
    err "注意：完整回滚需手动指定 sha：./deploy.sh rollback <sha>"
    exit 1
  fi

  if [ -z "$target_sha" ]; then
    err "未指定回滚目标 sha，且无历史记录"
    err "用法：./deploy.sh rollback <git-sha>"
    exit 1
  fi

  log "回滚到 sha: $target_sha"
  docker pull "ghcr.io/${IMAGE_OWNER}/${IMAGE_REPO}-server:$target_sha"
  docker tag "ghcr.io/${IMAGE_OWNER}/${IMAGE_REPO}-server:$target_sha" \
             "ghcr.io/${IMAGE_OWNER}/${IMAGE_REPO}-server:latest"

  compose up -d --remove-orphans --pull never
  log "回滚完成，等待健康检查..."
  if wait_health; then
    log "✅ 回滚成功"
  else
    err "❌ 回滚后健康检查仍失败"
    exit 1
  fi
}

cmd_status() {
  echo "=== 容器状态 ==="
  compose ps
  echo ""
  echo "=== 健康检查 ==="
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    log "服务健康"
    curl -s "$HEALTH_URL" | head -c 200
    echo ""
  else
    err "服务不健康（$HEALTH_URL 无响应）"
  fi
}

wait_health() {
  local elapsed=0
  while [ $elapsed -lt $HEALTH_WAIT ]; do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
      return 0
    fi
    sleep $HEALTH_INTERVAL
    elapsed=$((elapsed + HEALTH_INTERVAL))
    printf "."
  done
  echo ""
  return 1
}

# ============ 入口 ============

case "${1:-deploy}" in
  deploy)   cmd_deploy "${2:-}" ;;
  rollback) cmd_rollback "${2:-}" ;;
  status)   cmd_status ;;
  *)
    echo "用法：$0 {deploy [--skip-pull]|rollback [sha]|status}"
    exit 1
    ;;
esac
