/**
 * Database Snapshot Tool
 * Captures row counts for all tables as a reference snapshot.
 * Use to verify data integrity after resets.
 *
 * Usage: npx tsx db-snapshot.ts [--save]
 *   Without --save: print counts to console only
 *   With --save:    write to snapshot-<timestamp>.json
 */
import knex from 'knex';
import knexConfig from './src/db/knexfile';
import * as fs from 'fs';
import * as path from 'path';

const TABLES = [
  'Role', 'Permission', 'RolePermission', 'Employee', 'EmployeeRole',
  'Anchor', 'Supplier', 'Product', 'SKU', 'Inventory',
  '[User]', 'LiveSession', 'Script', '[Order]', 'InteractionLog',
  'AfterSale', 'PurchaseOrder', 'PurchaseSuggestion',
  'AnchorPerformance', 'ProductPerformance',
  'KPIIndicator', 'OperationReport', 'InterfaceLog', 'UserBehaviorStat',
  'LiveSessionReview', 'LivePlan', 'LivePlanItem', 'AnchorProductFit',
];

async function main() {
  const db = knex(knexConfig);
  const save = process.argv.includes('--save');
  const snapshot: Record<string, number> = {};
  const lines: string[] = [];

  console.log('Database Snapshot');
  console.log('='.repeat(52));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  let totalRows = 0;
  for (const table of TABLES) {
    try {
      const r = await db(table).count('* as cnt').first();
      const cnt = Number(r?.cnt || r?.[''] || 0);
      snapshot[table] = cnt;
      totalRows += cnt;
      lines.push(`${table.padEnd(24)} ${String(cnt).padStart(8)}`);
    } catch {
      lines.push(`${table.padEnd(24)} ${'(missing)'.padStart(8)}`);
      snapshot[table] = -1;
    }
  }

  for (const line of lines) console.log(`  ${line}`);
  console.log('');
  console.log(`  Total rows: ${totalRows.toLocaleString()}`);
  console.log(`  Tables: ${TABLES.filter(t => snapshot[t] >= 0).length}/${TABLES.length}`);

  if (save) {
    const file = `snapshot-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    const payload = {
      timestamp: new Date().toISOString(),
      database: knexConfig.connection?.database || 'unknown',
      tables: snapshot,
      totalRows,
    };
    fs.writeFileSync(path.resolve(__dirname, file), JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`\nSnapshot saved to: ${file}`);
  } else {
    console.log('\n(Use --save to write snapshot to file)');
  }

  await db.destroy();
}

main().catch(e => { console.error(e); process.exit(1); });
