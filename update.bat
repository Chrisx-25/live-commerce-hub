@echo off
chcp 65001 >nul
echo ╔══════════════════════════════════════╗
echo ║  live-commerce-hub 一键更新          ║
echo ╚══════════════════════════════════════╝
echo.

REM [1] Pull latest code
echo [1/3] 拉取最新代码...
git pull origin wkl
echo   √ 代码已更新

REM [2] Install deps
echo [2/3] 检查依赖...
call npm install --silent
cd server && call npm install --silent && cd ..
cd client && call npm install --silent && cd ..
echo   √ 依赖已就绪

REM [3] Restore database
echo [3/3] 同步数据库...
cd server && call npm run db:reset && cd ..
echo   √ 数据库已同步

echo.
echo ╔══════════════════════════════════════╗
echo ║  √ 更新完成！                       ║
echo ║  启动: npm run dev                   ║
echo ║  前端: http://localhost:5173         ║
echo ╚══════════════════════════════════════╝
