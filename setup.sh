#!/bin/bash
# setup.sh — live-commerce-hub 一键安装（Git Bash / WSL / macOS）
set -e

echo "╔══════════════════════════════════════╗"
echo "║  live-commerce-hub 一键安装          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# [1] Install dependencies
echo "[1/3] 安装依赖（约 1-2 分钟）..."
npm install --silent
(cd server && npm install --silent)
(cd client && npm install --silent)
echo "  ✓ 依赖安装完成"

# [2] Configure .env
echo "[2/3] 配置环境..."
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  echo "  ✓ 已创建 server/.env"
  echo "  ⚠ 如 sa 密码不是 a123456，请编辑 server/.env 修改 DB_PASSWORD"
else
  echo "  (server/.env 已存在，跳过)"
fi

# [3] Restore database
echo "[3/3] 恢复数据库（自动解压 .bak.gz → RESTORE，约 10 秒）..."
cd server
npx tsx db-restore.ts
cd ..

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✓ 安装完成！                       ║"
echo "║                                      ║"
echo "║  启动项目:  npm run dev              ║"
echo "║  前端地址:  http://localhost:5173    ║"
echo "║  后端地址:  http://localhost:3000    ║"
echo "║  默认账号:  EMP001 / 123456          ║"
echo "╚══════════════════════════════════════╝"
