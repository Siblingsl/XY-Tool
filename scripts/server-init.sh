#!/usr/bin/env bash
# ============================================================
# 闲鱼自动发货工具 - 服务器首次初始化脚本
#
# 在一台全新的 Linux 服务器（Ubuntu/Debian/CentOS）上执行：
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/server-init.sh | bash
# 或下载后执行：
#   bash server-init.sh
#
# 完成后，按提示编辑 .env.prod 并运行 ./deploy.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $*"; }

INSTALL_DIR="/opt/xianyu-tool"

# ============ 1. 安装 Docker ============
install_docker() {
  if command -v docker > /dev/null 2>&1; then
    log "Docker 已安装：$(docker --version)"
    return 0
  fi

  log "安装 Docker..."
  if command -v apt-get > /dev/null 2>&1; then
    # Debian/Ubuntu
    curl -fsSL https://get.docker.com | sh
  elif command -v yum > /dev/null 2>&1; then
    # CentOS/RHEL
    curl -fsSL https://get.docker.com | sh
  else
    echo "请手动安装 Docker：https://docs.docker.com/engine/install/"
    exit 1
  fi

  # 启动 Docker 服务
  systemctl enable docker
  systemctl start docker
  log "Docker 安装完成：$(docker --version)"
}

# ============ 2. 创建部署目录 ============
setup_dir() {
  log "创建部署目录 $INSTALL_DIR ..."
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"

  # 生成 .env.prod 模板（如不存在）
  if [ ! -f .env.prod ]; then
    cat > .env.prod <<'EOF'
# ====== 必填 ======
IMAGE_OWNER=your_github_username
IMAGE_REPO=xianyu-tool
DB_PASSWORD=
REDIS_PASSWORD=
JWT_SECRET=
JWT_REFRESH_SECRET=
COOKIE_ENCRYPTION_KEY=
CORS_ORIGIN=http://localhost
# 激活码对外验证（Codex 安装器 config.js 的 apiKey 须与此一致）
LICENSE_API_KEY=
# ====== 可选（按需调整）======
SIGN_PROVIDER=goofish
EOF
    log "已生成 .env.prod 模板，请编辑填写真实值"
  else
    log ".env.prod 已存在，跳过生成"
  fi

  # 生成密钥提示
  echo ""
  echo "=========================================="
  echo "  密钥生成参考（填入 .env.prod）："
  echo "=========================================="
  echo "DB_PASSWORD / REDIS_PASSWORD:"
  echo "  openssl rand -base64 24"
  echo ""
  echo "JWT_SECRET / JWT_REFRESH_SECRET:"
  echo "  openssl rand -hex 32"
  echo ""
  echo "COOKIE_ENCRYPTION_KEY（64位hex）:"
  echo "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  echo ""
  echo "LICENSE_API_KEY（激活码对外 API，与客户端 config.js 一致）:"
  echo "  openssl rand -hex 24"
  echo "=========================================="
}

# ============ 3. 登录 GHCR ============
login_ghcr() {
  echo ""
  log "登录 GHCR（拉私有镜像需要）..."
  warn "你需要一个 GitHub Personal Access Token（read:packages 权限）"
  echo "在 https://github.com/settings/tokens 创建"
  echo ""
  read -rp "输入 GHCR 用户名（GitHub 用户名）: " ghcr_user
  read -rsp "输入 GHCR Token: " ghcr_token
  echo ""
  echo "$ghcr_token" | docker login ghcr.io -u "$ghcr_user" --password-stdin
  log "GHCR 登录成功"
}

# ============ 4. 提示下载 compose 与脚本 ============
download_files() {
  echo ""
  log "请确保以下文件已放到 $INSTALL_DIR 目录："
  echo "  - docker-compose.prod.yml"
  echo "  - scripts/deploy.sh"
  echo ""
  echo "方法一（从 Git 拉取）："
  echo "  git clone https://github.com/<owner>/<repo>.git /tmp/repo"
  echo "  cp /tmp/repo/docker-compose.prod.yml $INSTALL_DIR/"
  echo "  cp -r /tmp/repo/scripts $INSTALL_DIR/"
  echo ""
  echo "方法二（手动下载）：从 GitHub Release 或 raw 文件下载"
}

# ============ 主流程 ============
main() {
  if [ "$(id -u)" -ne 0 ]; then
    warn "建议用 root 或 sudo 执行（安装 Docker 需要）"
  fi

  log "开始服务器初始化..."
  install_docker
  setup_dir
  login_ghcr
  download_files

  echo ""
  log "✅ 初始化完成！"
  echo ""
  echo "下一步："
  echo "  1. 编辑 $INSTALL_DIR/.env.prod 填写真实密钥"
  echo "  2. 确保 docker-compose.prod.yml 和 scripts/deploy.sh 在 $INSTALL_DIR"
  echo "  3. 运行 cd $INSTALL_DIR && bash scripts/deploy.sh"
}

main "$@"
