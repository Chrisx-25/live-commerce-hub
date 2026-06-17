import { Knex } from 'knex';
import { faker } from '@faker-js/faker/locale/zh_CN';
import { v4 as uuid } from 'uuid';

const BATCH = 200; // MSSQL parameter limit is 2100, 200 rows × 10 cols = 2000 safe
const id = () => uuid().replace(/-/g, '').substring(0, 16);

const PLATFORMS = ['抖音', '快手'];
const ANCHOR_LEVELS = ['S', 'A', 'B', 'C'];
const CATEGORIES = ['女装', '美妆', '箱包', '运动户外', '零食', '家居用品', '母婴', '数码', '食品饮料'];

const CORE_ANCHORS = [
  { name: '王凯乐', specialization: '美妆', level: 'S', platform: '抖音', fans: 5800000 },
  { name: '李佳琦', specialization: '美妆', level: 'S', platform: '抖音', fans: 8500000 },
  { name: '薇娅', specialization: '女装', level: 'S', platform: '抖音', fans: 7200000 },
  { name: '罗永浩', specialization: '数码', level: 'A', platform: '抖音', fans: 5600000 },
  { name: '张沫凡', specialization: '美妆', level: 'A', platform: '快手', fans: 3200000 },
  { name: '散打哥', specialization: '食品饮料', level: 'A', platform: '快手', fans: 4800000 },
  { name: '雪梨', specialization: '女装', level: 'B', platform: '抖音', fans: 2100000 },
  { name: '董先生', specialization: '数码', level: 'B', platform: '抖音', fans: 1800000 },
  { name: '刘畊宏', specialization: '运动户外', level: 'B', platform: '抖音', fans: 4300000 },
  { name: '郝劭文', specialization: '零食', level: 'C', platform: '抖音', fans: 950000 },
  { name: '朱梓骁', specialization: '美妆', level: 'C', platform: '快手', fans: 1500000 },
];

const CORE_EMPLOYEES = [
  { id: 'EMP001', name: '张管理', department: '管理层', position: '总经理', role: '管理层' },
  { id: 'EMP002', name: '李运营', department: '运营部', position: '运营主管', role: '运营人员' },
  { id: 'EMP003', name: '王采购', department: '采购部', position: '采购专员', role: '采购人员' },
  { id: 'EMP004', name: '赵仓储', department: '仓储部', position: '仓储主管', role: '仓储人员' },
  { id: 'EMP005', name: '王凯乐', department: '直播部', position: '主播', role: '主播' },
  { id: 'EMP006', name: '刘系统', department: '技术部', position: '系统管理员', role: '系统管理员' },
];

const ROLE_IDS: Record<string, string> = {
  '管理层': 'ROLE001', '运营人员': 'ROLE002', '采购人员': 'ROLE003',
  '仓储人员': 'ROLE004', '主播': 'ROLE005', '系统管理员': 'ROLE006',
};

export async function seed(knex: Knex): Promise<void> {
  console.log('[Seed] 仅填充基础结构数据（业务内容由 LLM 生成）...\n');

  // ===== 1. Roles & Permissions =====
  console.log('[1/8] 角色与权限...');
  await knex('RolePermission').del();
  await knex('EmployeeRole').del();
  await knex('Role').del();
  await knex('Permission').del();

  const roles = [
    { role_id: 'ROLE001', role_name: '管理层', role_description: '查看全部数据与分析' },
    { role_id: 'ROLE002', role_name: '运营人员', role_description: '管理直播运营与商品' },
    { role_id: 'ROLE003', role_name: '采购人员', role_description: '管理采购与供应商' },
    { role_id: 'ROLE004', role_name: '仓储人员', role_description: '管理库存与出入库' },
    { role_id: 'ROLE005', role_name: '主播', role_description: '查看个人绩效与脚本' },
    { role_id: 'ROLE006', role_name: '系统管理员', role_description: '系统配置与权限管理' },
  ];
  await knex('Role').insert(roles);

  const permissions = [
    { permission_id: 'PERM001', permission_name: '看板查看', module_name: '看板' },
    { permission_id: 'PERM002', permission_name: '商品管理', module_name: '商品' },
    { permission_id: 'PERM003', permission_name: '主播管理', module_name: '主播' },
    { permission_id: 'PERM004', permission_name: '选品分析', module_name: '选品' },
    { permission_id: 'PERM005', permission_name: '采购管理', module_name: '采购' },
    { permission_id: 'PERM006', permission_name: '库存管理', module_name: '库存' },
    { permission_id: 'PERM007', permission_name: '直播监控', module_name: '直播' },
    { permission_id: 'PERM008', permission_name: '脚本管理', module_name: '脚本' },
    { permission_id: 'PERM009', permission_name: '数据分析', module_name: '分析' },
    { permission_id: 'PERM010', permission_name: '售后管理', module_name: '售后' },
    { permission_id: 'PERM011', permission_name: '报告查看', module_name: '报告' },
    { permission_id: 'PERM012', permission_name: '系统设置', module_name: '系统' },
    { permission_id: 'PERM013', permission_name: '直播场次管理', module_name: '直播' },
    { permission_id: 'PERM014', permission_name: '采购建议查看', module_name: '采购' },
    { permission_id: 'PERM015', permission_name: '主播绩效查看', module_name: '主播' },
    { permission_id: 'PERM016', permission_name: '商品表现查看', module_name: '商品' },
    { permission_id: 'PERM017', permission_name: '接口日志查看', module_name: '系统' },
    { permission_id: 'PERM018', permission_name: 'AI脚本生成', module_name: '脚本' },
    { permission_id: 'PERM019', permission_name: 'AI弹幕分析', module_name: '直播' },
    { permission_id: 'PERM020', permission_name: '数字顾问报告', module_name: '选品' },
  ];
  await knex('Permission').insert(permissions);

  // RBAC mapping — matches acceptance seed (16/16/5/5/7/20 = 69 rows)
  const allPerms = permissions.map(p => p.permission_id);
  const mgmtPerms    = ['PERM001','PERM002','PERM003','PERM004','PERM007','PERM008','PERM009','PERM010','PERM011','PERM013','PERM014','PERM015','PERM016','PERM018','PERM019','PERM020'];
  const opPerms      = ['PERM001','PERM002','PERM003','PERM004','PERM007','PERM008','PERM009','PERM010','PERM011','PERM013','PERM014','PERM015','PERM016','PERM018','PERM019','PERM020'];
  const purchPerms   = ['PERM001','PERM005','PERM010','PERM014','PERM016'];
  const whPerms      = ['PERM001','PERM006','PERM010','PERM014','PERM016'];
  const anchorPerms  = ['PERM001','PERM007','PERM008','PERM009','PERM010','PERM015','PERM018','PERM019'];
  const ap: { relation_id: string; role_id: string; permission_id: string }[] = [];
  for (const p of mgmtPerms)   ap.push({ relation_id: id(), role_id: 'ROLE001', permission_id: p });
  for (const p of opPerms)     ap.push({ relation_id: id(), role_id: 'ROLE002', permission_id: p });
  for (const p of purchPerms)  ap.push({ relation_id: id(), role_id: 'ROLE003', permission_id: p });
  for (const p of whPerms)     ap.push({ relation_id: id(), role_id: 'ROLE004', permission_id: p });
  for (const p of anchorPerms) ap.push({ relation_id: id(), role_id: 'ROLE005', permission_id: p });
  for (const p of allPerms)    ap.push({ relation_id: id(), role_id: 'ROLE006', permission_id: p });
  await knex('RolePermission').insert(ap);

  // ===== 2. Employees =====
  console.log('[2/8] 员工账号...');
  await knex('Employee').del();
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('123456', 10);
  const emps = CORE_EMPLOYEES.map(e => ({
    employee_id: e.id,
    employee_name: e.name,
    department: e.department,
    position: e.position,
    phone: faker.phone.number(),
    email: faker.internet.email(),
    status: '在职',
    join_date: '2024-01-01',
    password_hash: hash,
  }));
  await knex('Employee').insert(emps);
  const er = CORE_EMPLOYEES.map(e => ({
    relation_id: id(),
    employee_id: e.id,
    role_id: ROLE_IDS[e.role],
  }));
  await knex('EmployeeRole').insert(er);

  // ===== 3. Anchors =====
  console.log('[3/8] 主播...');
  await knex('Anchor').del();
  const anchors: any[] = [];
  for (const a of CORE_ANCHORS) {
    anchors.push({
      anchor_id: id(),
      anchor_name: a.name,
      gender: ['王凯乐','李佳琦','罗永浩','散打哥','董先生','刘畊宏'].includes(a.name) ? '男' : '女',
      join_date: faker.date.between({ from: '2023-01-01', to: '2024-12-31' }).toISOString().split('T')[0],
      account_platform: a.platform,
      fan_count: a.fans,
      specialization: a.specialization,
      anchor_level: a.level,
      status: '在岗',
    });
  }
  for (let i = 0; i < 15; i++) {
    anchors.push({
      anchor_id: id(),
      anchor_name: faker.person.fullName(),
      gender: faker.helpers.arrayElement(['男', '女']),
      join_date: faker.date.between({ from: '2023-06-01', to: '2024-12-31' }).toISOString().split('T')[0],
      account_platform: faker.helpers.arrayElement(PLATFORMS),
      fan_count: faker.number.int({ min: 50000, max: 3000000 }),
      specialization: faker.helpers.arrayElement(CATEGORIES),
      anchor_level: faker.helpers.arrayElement(ANCHOR_LEVELS),
      status: '在岗',
    });
  }
  await knex('Anchor').insert(anchors);

  // Link EMP005 (王凯乐) to the first anchor
  await knex('Employee').where('employee_id', 'EMP005').update({ anchor_id: anchors[0].anchor_id });

  // ===== 4. Users =====
  console.log('[4/8] 用户 (8000)...');
  await knex('User').del();
  const users: any[] = [];
  for (let i = 0; i < 8000; i++) {
    users.push({
      user_id: id(),
      platform_user_id: `PU${faker.string.numeric(10)}`,
      nickname: faker.internet.displayName(),
      gender: faker.helpers.arrayElement(['男', '女']),
      user_level: faker.helpers.arrayElement(['普通用户', '银牌用户', '金牌用户', '钻石用户']),
      register_platform: faker.helpers.arrayElement(PLATFORMS),
      purchase_count: faker.number.int({ min: 0, max: 100 }),
      total_consumption: parseFloat((Math.random() * 10000).toFixed(2)),
      last_active_time: faker.date.recent({ days: 90 }),
      create_time: faker.date.between({ from: '2023-01-01', to: '2025-02-01' }),
    });
    if (users.length >= BATCH) { await knex.batchInsert('User', users, BATCH); users.length = 0; }
  }
  if (users.length > 0) await knex.batchInsert('User', users, BATCH);

  // ===== 5. LiveSessions =====
  console.log('[5/8] 直播场次 (300)...');
  await knex('LiveSession').del();
  const anchorIds = anchors.map(a => a.anchor_id);
  const sessions: any[] = [];
  for (let i = 0; i < 300; i++) {
    const startTime = faker.date.between({ from: '2024-12-01', to: '2025-05-26' });
    const endTime = new Date(startTime.getTime() + faker.number.int({ min: 2, max: 6 }) * 3600000);
    const status = faker.helpers.arrayElement(['已结束', '已结束', '已结束', '已结束', '进行中', '已排期', '待安排']);
    const peak = ['已排期', '待安排'].includes(status) ? null : faker.number.int({ min: 500, max: 50000 });
    const sales = status === '已结束' ? parseFloat((Math.random() * 200000 + 5000).toFixed(2))
      : (status === '进行中' ? parseFloat((Math.random() * 50000).toFixed(2)) : 0);
    sessions.push({
      live_id: id(),
      anchor_id: faker.helpers.arrayElement(anchorIds),
      live_title: `${faker.helpers.arrayElement(CATEGORIES)}专场直播`,
      start_time: startTime,
      end_time: status === '已结束' ? endTime : null,
      platform: faker.helpers.arrayElement(PLATFORMS),
      live_category: faker.helpers.arrayElement(CATEGORIES),
      live_status: status,
      online_peak: peak,
      total_sales: sales,
    });
  }
  await knex.batchInsert('LiveSession', sessions, BATCH);

  // ===== 6. Suppliers =====
  console.log('[6/9] 供应商 (30)...');
  await knex('Supplier').del();
  const suppliers: any[] = [];
  for (let i = 0; i < 30; i++) {
    suppliers.push({
      supplier_id: id(),
      supplier_name: faker.company.name(),
      contact_person: faker.person.fullName(),
      contact_phone: faker.phone.number(),
      address: faker.location.streetAddress({ useFullAddress: true }),
      cooperation_status: faker.helpers.arrayElement(['合作中', '合作中', '合作中', '观察中']),
      supplier_score: parseFloat((70 + Math.random() * 28).toFixed(1)),
      delivery_cycle: faker.number.int({ min: 2, max: 14 }),
    });
  }
  await knex('Supplier').insert(suppliers);

  // ===== 7. KPIIndicators =====
  console.log('[7/9] KPI指标...');
  await knex('KPIIndicator').del();
  await knex('KPIIndicator').insert([
    { indicator_id: id(), indicator_name: 'GMV增长率', indicator_type: '财务', target_value: 15, statistical_period: '月度', applicable_role: '管理层' },
    { indicator_id: id(), indicator_name: '转化率', indicator_type: '运营', target_value: 5, statistical_period: '场次', applicable_role: '运营人员' },
    { indicator_id: id(), indicator_name: '退货率', indicator_type: '售后', target_value: 3, statistical_period: '月度', applicable_role: '运营人员' },
    { indicator_id: id(), indicator_name: '库存周转天数', indicator_type: '供应链', target_value: 30, statistical_period: '月度', applicable_role: '仓储人员' },
    { indicator_id: id(), indicator_name: '主播场均GMV', indicator_type: '主播', target_value: 50000, statistical_period: '场次', applicable_role: '主播' },
    { indicator_id: id(), indicator_name: '采购成本节约率', indicator_type: '采购', target_value: 5, statistical_period: '季度', applicable_role: '采购人员' },
    { indicator_id: id(), indicator_name: '用户复购率', indicator_type: '运营', target_value: 25, statistical_period: '季度', applicable_role: '运营人员' },
    { indicator_id: id(), indicator_name: '粉丝增长率', indicator_type: '主播', target_value: 10, statistical_period: '月度', applicable_role: '主播' },
  ]);

  // ===== 8. InterfaceLogs =====
  console.log('[8/9] 接口日志 (500)...');
  await knex('InterfaceLog').del();
  const logs: any[] = [];
  for (let i = 0; i < 500; i++) {
    logs.push({
      log_id: id(),
      platform_name: faker.helpers.arrayElement(PLATFORMS),
      interface_name: faker.helpers.arrayElement(['获取商品列表', '同步订单', '获取用户信息', '同步物流', '商品上下架']),
      request_time: faker.date.recent({ days: 30 }),
      response_status: faker.helpers.arrayElement(['成功', '成功', '成功', '成功', '失败']),
      data_count: faker.number.int({ min: 1, max: 500 }),
      error_message: Math.random() > 0.8 ? 'Timeout' : null,
    });
  }
  await knex.batchInsert('InterfaceLog', logs, BATCH);

  // ===== 9. OperationReports (structure only, content by LLM) =====
  console.log('[9/9] 运营报告框架 (20)...');
  await knex('OperationReport').del();
  const reports: any[] = [];
  const reportTypes = ['周报', '月报', '季报', '专项分析'];
  for (let i = 0; i < 20; i++) {
    const rt = faker.helpers.arrayElement(reportTypes);
    reports.push({
      report_id: id(),
      report_type: rt,
      report_title: `${rt} - ${faker.date.recent({ days: 90 }).toISOString().split('T')[0]}`,
      report_content: '', // LLM will fill
      creator_id: faker.helpers.arrayElement(CORE_EMPLOYEES.map(e => e.id)),
      create_time: faker.date.recent({ days: 90 }),
      statistical_period: faker.helpers.arrayElement(['2025年1月', '2025年2月', '2025年3月', '2025年Q1']),
    });
  }
  await knex('OperationReport').insert(reports);

  console.log('\n[Seed] 基础数据完成！业务内容将由 LLM 生成。');
}
