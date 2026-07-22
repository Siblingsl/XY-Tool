#!/usr/bin/env bash
# 海外机：拉取最新 research-api 镜像并重启（也可由 GitHub Actions SSH 调用）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "缺少 .env，请先 cp .env.example .env 并填写"
  exit 1
fi

echo "[deploy] pull & up..."
docker compose --env-file .env pull api || true
docker compose --env-file .env up -d --remove-orphans --force-recreate
docker compose --env-file .env ps
HOST_PORT=$(grep -E '^API_HOST_PORT=' .env | cut -d= -f2 | tr -d '"' | tr -d "'")
HOST_PORT=${HOST_PORT:-46189}
echo "[deploy] health:"
curl -sf "http://127.0.0.1:${HOST_PORT}/api/research/health" && echo || echo "(wait a few seconds and retry)"
