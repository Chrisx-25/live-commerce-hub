@echo off
chcp 65001 >nul
echo ╔══════════════════════════════════════╗
echo ║  live-commerce-hub 一键安装          ║
echo ╚══════════════════════════════════════╝
echo.

REM [1] Install dependencies
echo [1/3] 安装依赖（约 1-2 分钟）...
call npm install --silent
cd server && call npm install --silent && cd ..
cd client && call npm install --silent && cd ..
echo   √ 依赖安装完成

REM [2] Configure .env
echo [2/3] 配置环境...
if not exist "server\.env" (
  copy server\.env.example server\.env >nul
  echo   √ 已创建 server\.env
  echo   ! 如 sa 密码不是 a123456，请编辑 server\.env 修改 DB_PASSWORD
) else (
  echo   (server\.env 已存在，跳过)
)

REM [3] Restore database
echo [3/3] 恢复数据库（自动解压 .bak.gz → RESTORE，约 10 秒）...
cd server
call npx tsx db-restore.ts
cd ..

echo.
echo ╔══════════════════════════════════════╗
echo ║  √ 安装完成！                       ║
echo ║                                      ║
echo ║  启动项目:  npm run dev              ║
echo ║  前端地址:  http://localhost:5173    ║
echo ║  后端地址:  http://localhost:3000    ║
echo ║  默认账号:  EMP001 / 123456          ║
echo ╚══════════════════════════════════════╝
