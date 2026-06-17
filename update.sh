#!/bin/bash
# update.sh — 一键同步最新代码+数据库（Git Bash / WSL / macOS）
set -e

echo "╔══════════════════════════════════════╗"
echo "║  live-commerce-hub 一键更新          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# [1] Pull latest code
echo "[1/3] 拉取最新代码..."
git pull origin wkl
echo "  ✓ 代码已更新"

# [2] Install deps (in case of new dependencies)
echo "[2/3] 检查依赖..."
npm install --silent
(cd server && npm install --silent)
(cd client && npm install --silent)
echo "  ✓ 依赖已就绪"

# [3] Restore database
echo "[3/3] 同步数据库..."
cd server && npm run db:reset && cd ..
echo "  ✓ 数据库已同步"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✓ 更新完成！                       ║"
echo "║  启动: npm run dev                   ║"
echo "║  前端: http://localhost:5173         ║"
echo "╚══════════════════════════════════════╝"
