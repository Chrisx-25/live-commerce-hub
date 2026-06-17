import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const server = process.env.DB_SERVER || 'localhost';
const db = process.env.DB_DATABASE || 'live_commerce_hub';
const user = process.env.DB_USER || 'sa';
const pass = process.env.DB_PASSWORD || 'a123456';
const bakFile = path.resolve('db-backups/live_commerce_hub_2026-06-17.bak');
const gzFile = bakFile + '.gz';

// Clean old files
for (const f of [bakFile, gzFile]) {
  if (fs.existsSync(f)) { fs.unlinkSync(f); }
}

// Backup via SQL file (avoids shell escaping)
const sql = `BACKUP DATABASE [${db}] TO DISK = N'${bakFile.replace(/\\/g, '\\\\')}' WITH INIT, FORMAT`;
const sqlFile = path.resolve('_backup.sql');
fs.writeFileSync(sqlFile, sql, 'utf-8');

console.log('Backing up database...');
execSync(`sqlcmd -S ${server} -U ${user} -P ${pass} -i "${sqlFile}"`, { stdio: 'inherit', timeout: 60000 });
fs.unlinkSync(sqlFile);

const sizeMB = (fs.statSync(bakFile).size / 1024 / 1024).toFixed(1);
console.log(`Backup: ${sizeMB} MB`);

// Gzip
console.log('Compressing...');
execSync(`gzip -f "${bakFile}"`, { stdio: 'inherit', timeout: 120000 });
const gzMB = (fs.statSync(gzFile).size / 1024 / 1024).toFixed(1);
console.log(`Done: db-backups/live_commerce_hub_2026-06-17.bak.gz (${gzMB} MB)`);
