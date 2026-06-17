/**
 * db-restore.ts — 从 MSSQL 备份文件恢复数据库
 *
 * 用法:
 *   npx tsx db-restore.ts                       恢复默认备份文件
 *   npx tsx db-restore.ts --bak <path>          指定备份文件路径
 *   npx tsx db-restore.ts --list                列出可用备份文件
 *
 * 前置条件:
 *   - MSSQL 运行在 localhost:1433
 *   - sa 账号可用（密码从 .env 读取或默认 a123456）
 *   - 备份文件路径不能包含中文
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = process.env.DB_NAME || 'live_commerce_hub';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'sa';
const DB_PASSWORD = process.env.DB_PASSWORD || 'a123456';
const BACKUP_DIR = path.resolve(__dirname, 'db-backups');
const DEFAULT_BAK = path.join(BACKUP_DIR, 'live_commerce_hub_2026-06-17.bak');

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('  (没有备份目录)');
    return [];
  }
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.bak'))
    .map(f => {
      const fp = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(fp);
      return { name: f, path: fp, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files;
}

function restore(bakPath: string) {
  if (!fs.existsSync(bakPath)) {
    console.error(`✗ 备份文件不存在: ${bakPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(bakPath);
  console.log(`\n准备恢复数据库 [${DB_NAME}]`);
  console.log(`  备份文件: ${path.basename(bakPath)}`);
  console.log(`  大小: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  时间: ${stat.mtime.toISOString()}`);
  console.log('');

  // Step 1: kill all connections (retry up to 3 times — tsx watch may restart)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync(
        `sqlcmd -S ${DB_HOST} -U ${DB_USER} -P "${DB_PASSWORD}" -Q "ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      break;
    } catch (err: any) {
      if (attempt < 3) {
        console.log(`  等待连接释放 (尝试 ${attempt}/3)...`);
        execSync('sleep 3', { timeout: 5000 });
      } else {
        throw err;
      }
    }
  }

  // Step 2: restore
  const restoreSQL = `RESTORE DATABASE [${DB_NAME}] FROM DISK = N'${bakPath.replace(/\\/g, '\\\\')}' WITH REPLACE;
ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`;

  try {
    console.log('正在恢复...');
    const result = execSync(
      `sqlcmd -S ${DB_HOST} -U ${DB_USER} -P "${DB_PASSWORD}" -Q "${restoreSQL.replace(/\n/g, ' ')}"`,
      { encoding: 'utf-8', timeout: 120000 }
    );
    console.log(result);

    // Verify: check that key tables have data
    try {
      const check = execSync(
        `sqlcmd -S ${DB_HOST} -U ${DB_USER} -P "${DB_PASSWORD}" -Q "SET NOCOUNT ON; SELECT 'EMP_COUNT:' + CAST(COUNT(*) AS VARCHAR) FROM [live_commerce_hub].[dbo].[Employee]; SELECT 'ORD_COUNT:' + CAST(COUNT(*) AS VARCHAR) FROM [live_commerce_hub].[dbo].[Order]; SELECT 'SES_COUNT:' + CAST(COUNT(*) AS VARCHAR) FROM [live_commerce_hub].[dbo].[LiveSession];"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      const empMatch = check.match(/EMP_COUNT:(\d+)/);
      const ordMatch = check.match(/ORD_COUNT:(\d+)/);
      const sesMatch = check.match(/SES_COUNT:(\d+)/);
      const empCount = empMatch ? parseInt(empMatch[1]) : -1;
      const ordCount = ordMatch ? parseInt(ordMatch[1]) : -1;
      const sesCount = sesMatch ? parseInt(sesMatch[1]) : -1;
      console.log(`\n✓ 数据校验: Employee=${empCount}  Order=${ordCount}  LiveSession=${sesCount}`);
      if (empCount === 0) {
        console.error('✗ 警告: Employee 表为空，恢复可能未生效！');
      }
    } catch (_) {
      // non-critical — skip verification
    }

    console.log('✓ 数据库恢复完成！请重启后端服务。');
  } catch (err: any) {
    console.error('✗ 恢复失败:', err.message);
    // Try to set multi_user back even on failure
    try {
      execSync(
        `sqlcmd -S ${DB_HOST} -U ${DB_USER} -P "${DB_PASSWORD}" -Q "ALTER DATABASE [${DB_NAME}] SET MULTI_USER;"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
    } catch {}
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.includes('--list')) {
  console.log('\n可用备份文件:');
  const files = listBackups();
  if (files.length === 0) {
    console.log('  (无)');
  } else {
    for (const f of files) {
      console.log(`  ${f.name}  (${(f.size / 1024 / 1024).toFixed(1)} MB, ${f.mtime.toISOString()})`);
    }
  }
  console.log('');
  process.exit(0);
}

const bakIndex = args.indexOf('--bak');
const bakPath = bakIndex >= 0 ? path.resolve(args[bakIndex + 1]) : DEFAULT_BAK;

restore(bakPath);
