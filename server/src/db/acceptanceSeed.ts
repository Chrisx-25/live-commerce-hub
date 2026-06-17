import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

const pad = (value: number, width = 4) => String(value).padStart(width, '0');
const id = (prefix: string, value: number) => `${prefix}${pad(value)}`;
const day = (offset: number) => new Date(Date.UTC(2026, 4, 1 + offset, 10, 0, 0));
const money = (value: number) => Number(value.toFixed(2));
const pct = (value: number) => Number(value.toFixed(2));

const CATEGORIES = ['女装', '美妆', '箱包', '运动户外', '零食', '家居用品', '母婴', '数码', '食品饮料'];
const PLATFORMS = ['抖音', '快手', '淘宝直播'];

const EMPLOYEES = [
  { employee_id: 'EMP001', employee_name: '张管理', department: '管理层', position: '总经理', role_id: 'ROLE001' },
  { employee_id: 'EMP002', employee_name: '李运营', department: '运营部', position: '运营主管', role_id: 'ROLE002' },
  { employee_id: 'EMP003', employee_name: '王采购', department: '采购部', position: '采购专员', role_id: 'ROLE003' },
  { employee_id: 'EMP004', employee_name: '赵仓储', department: '仓储部', position: '仓储主管', role_id: 'ROLE004' },
  { employee_id: 'EMP005', employee_name: '王凯乐', department: '直播部', position: '主播', role_id: 'ROLE005', anchor_id: 'A001' },
  { employee_id: 'EMP006', employee_name: '刘系统', department: '技术部', position: '系统管理员', role_id: 'ROLE006' },
];

const ROLES = [
  { role_id: 'ROLE001', role_name: '管理层', role_description: '查看全部数据与分析' },
  { role_id: 'ROLE002', role_name: '运营人员', role_description: '管理直播运营、商品、选品与售后' },
  { role_id: 'ROLE003', role_name: '采购人员', role_description: '管理采购建议、采购单与供应商' },
  { role_id: 'ROLE004', role_name: '仓储人员', role_description: '管理库存、入库出库和预警' },
  { role_id: 'ROLE005', role_name: '主播', role_description: '查看脚本、直播监控和个人绩效' },
  { role_id: 'ROLE006', role_name: '系统管理员', role_description: '维护账号、角色和接口日志' },
];

const PERMISSIONS = [
  '看板查看', '商品管理', '主播管理', '选品分析', '采购管理', '库存管理', '直播监控',
  '脚本管理', '数据分析', '售后管理', '报告查看', '系统设置', '直播场次管理',
  '采购建议查看', '主播绩效查看', '商品表现查看', '接口日志查看', 'AI脚本生成',
  'AI弹幕分析', '数字顾问报告',
].map((permission_name, index) => ({
  permission_id: id('PERM', index + 1),
  permission_name,
  module_name: permission_name.replace(/查看|管理|生成|分析/g, ''),
  permission_description: `${permission_name}权限`,
}));

const ANCHORS = [
  ['A001', '王凯乐', '女', '抖音', '美妆', 'S', 5800000],
  ['A002', '周野', '男', '抖音', '数码', 'A', 3900000],
  ['A003', '赵琪', '女', '快手', '女装', 'A', 3200000],
  ['A004', '沈航', '男', '淘宝直播', '运动户外', 'B', 1800000],
  ['A005', '唐小米', '女', '抖音', '零食', 'B', 1600000],
  ['A006', '何安', '男', '快手', '家居用品', 'B', 1300000],
  ['A007', '苏棠', '女', '淘宝直播', '母婴', 'C', 760000],
  ['A008', '许诺', '女', '抖音', '箱包', 'C', 690000],
  ['A009', '江川', '男', '快手', '食品饮料', 'B', 1200000],
  ['A010', '叶青', '女', '淘宝直播', '美妆', 'A', 2600000],
  ['A011', '宋岩', '男', '抖音', '数码', 'C', 540000],
  ['A012', '程鹿', '女', '快手', '女装', 'B', 1500000],
];

export function buildAcceptancePreview() {
  const suppliers = Array.from({ length: 24 }, (_, index) => {
    const n = index + 1;
    return {
      supplier_id: id('SUP', n),
      supplier_name: `${CATEGORIES[index % CATEGORIES.length]}优选供应商${pad(n, 2)}`,
      contact_person: `联系人${pad(n, 2)}`,
      contact_phone: `1380000${pad(n, 4)}`,
      address: `杭州市直播供应链园区${n}号仓`,
      cooperation_status: n % 8 === 0 ? '观察中' : '合作中',
      supplier_score: pct(72 + (n % 9) * 2.7),
      delivery_cycle: 3 + (n % 7),
    };
  });

  const products = Array.from({ length: 144 }, (_, index) => {
    const n = index + 1;
    const category = CATEGORIES[index % CATEGORIES.length];
    const cost = 18 + (index % 12) * 7 + Math.floor(index / CATEGORIES.length) * 1.3;
    const gross = 28 + (index % 8) * 2.6;
    const sale = cost / (1 - gross / 100);
    return {
      product_id: id('PROD', n),
      product_name: `${category}爆款候选商品${pad(n, 3)}`,
      category,
      brand: `${category}品牌${(index % 18) + 1}`,
      cost_price: money(cost),
      sale_price: money(sale),
      gross_profit_rate: pct(gross),
      product_status: n % 31 === 0 ? '待评估' : '在售',
      supplier_id: suppliers[index % suppliers.length].supplier_id,
      description: `面向直播间高频转化场景的${category}候选商品，覆盖价格、库存、履约和售后指标。`,
      selling_points: `价格带清晰；供应稳定；适合直播讲解；可用于新品冷启动评估`,
      create_time: day(-120 + n),
    };
  });

  const skus = products.flatMap((product, productIndex) => (
    ['基础款', '直播专享', '组合装'].map((name, variantIndex) => ({
      sku_id: id('SKU', productIndex * 3 + variantIndex + 1),
      product_id: product.product_id,
      sku_name: `${product.product_name}-${name}`,
      color: ['默认', '浅色', '深色'][variantIndex],
      size: ['S', 'M', 'L'][variantIndex],
      specification: `${name}规格`,
      stock_quantity: 180 + ((productIndex + variantIndex) % 12) * 35,
      warning_threshold: 60,
      sales_volume: 20 + ((productIndex + variantIndex) % 20) * 6,
      sku_status: '在售',
    }))
  ));

  const inventory = skus.flatMap((sku, index) => (
    ['杭州中心仓', '广州直播仓'].map((warehouse, warehouseIndex) => {
      const lowStock = (index + warehouseIndex) % 11 === 0;
      return {
        inventory_id: id('INV', index * 2 + warehouseIndex + 1),
        sku_id: sku.sku_id,
        warehouse_name: warehouse,
        batch_number: `B2026${pad(index + 1)}${warehouseIndex + 1}`,
        production_date: day(-90 + (index % 30)),
        expiration_date: day(270 + (index % 80)),
        current_stock: lowStock ? 28 + warehouseIndex * 12 : sku.stock_quantity - warehouseIndex * 25,
        inbound_quantity: sku.stock_quantity + 80,
        outbound_quantity: 80 + warehouseIndex * 25,
        safety_stock: 80,
        inventory_status: lowStock ? '预警' : '正常',
        last_update_time: day(40 + (index % 20)),
      };
    })
  ));

  const anchors = ANCHORS.map(([anchor_id, anchor_name, gender, account_platform, specialization, anchor_level, fan_count], index) => ({
    anchor_id,
    anchor_name,
    gender,
    join_date: '2024-01-01',
    account_platform,
    fan_count,
    specialization,
    anchor_level,
    status: '在岗',
  }));

  const users = Array.from({ length: 800 }, (_, index) => ({
    user_id: id('USR', index + 1),
    platform_user_id: `PF${pad(index + 1, 6)}`,
    nickname: `直播用户${pad(index + 1, 4)}`,
    gender: index % 2 === 0 ? '女' : '男',
    user_level: ['普通用户', '银牌用户', '金牌用户', '钻石用户'][index % 4],
    register_platform: PLATFORMS[index % PLATFORMS.length],
    purchase_count: index % 70,
    total_consumption: money((index % 90) * 96.5),
    last_active_time: day(35 + (index % 20)),
    create_time: day(-300 + (index % 120)),
  }));

  const liveSessions = Array.from({ length: 120 }, (_, index) => {
    const anchor = anchors[index % anchors.length];
    const status = index < 96 ? '已结束' : (index < 102 ? '进行中' : (index < 111 ? '已排期' : '待安排'));
    const start = day(index - 78);
    return {
      live_id: id('LIVE', index + 1),
      anchor_id: anchor.anchor_id,
      live_title: `${anchor.specialization}验收直播专场${pad(index + 1, 3)}`,
      start_time: start,
      end_time: status === '已结束' ? new Date(start.getTime() + 3 * 60 * 60 * 1000) : null,
      platform: anchor.account_platform,
      live_category: anchor.specialization,
      live_status: status,
      online_peak: ['已排期', '待安排'].includes(status) ? null : 1800 + (index % 30) * 420,
      total_sales: ['已排期', '待安排'].includes(status) ? 0 : money(18000 + (index % 24) * 5200),
    };
  });

  const productPerformances = products.flatMap((product, productIndex) => {
    const trendFactor = (productIndex % 7) - 3;
    const sessionIndexes = [
      productIndex % 30,
      30 + (productIndex % 26),
      60 + (productIndex % 18),
      78 + (productIndex % 14),
      90 + (productIndex % 6),
    ];
    return sessionIndexes.map((sessionIndex, perfIndex) => {
      const session = liveSessions[sessionIndex];
      const periodLift = perfIndex >= 2 ? trendFactor * 10 : -trendFactor * 6;
      const volatility = ((productIndex + perfIndex * 3) % 9) - 4;
      const sales = Math.max(8, 58 + (productIndex % 18) * 5 + periodLift + volatility * 2);
      const conversion = Math.max(0.8, 2.4 + (productIndex % 8) * 0.28 + periodLift / 32 + volatility * 0.05);
      const heat = Math.max(10, 42 + (productIndex % 12) * 5 + periodLift * 1.7 + volatility * 2.4);
      return {
        performance_id: id('PP', productIndex * 5 + perfIndex + 1),
        product_id: product.product_id,
        live_id: session.live_id,
        click_rate: pct(5 + (productIndex % 10) * 0.8 + volatility * 0.08),
        conversion_rate: pct(conversion),
        refund_rate: pct(1.2 + (productIndex % 6) * 0.55 + Math.max(0, -trendFactor) * 0.08),
        interaction_heat: pct(heat),
        sales_volume: Math.round(sales),
        gmv: money(sales * Number(product.sale_price)),
      };
    });
  });

  const orders = Array.from({ length: 2400 }, (_, index) => {
    const sku = skus[index % skus.length];
    const product = products.find((p) => p.product_id === sku.product_id)!;
    const quantity = 1 + (index % 3 === 0 ? 1 : 0);
    const amount = money(Number(product.sale_price) * quantity * (index % 11 === 0 ? 0.9 : 1));
    return {
      order_id: id('ORD', index + 1),
      user_id: users[index % users.length].user_id,
      live_id: liveSessions[index % 108].live_id,
      sku_id: sku.sku_id,
      original_price: product.sale_price,
      discount_amount: money(Number(product.sale_price) * quantity - amount),
      order_quantity: quantity,
      order_amount: amount,
      payment_status: '已支付',
      order_status: index % 23 === 0 ? '售后中' : '已完成',
      order_time: day(index % 78),
    };
  });

  const interactionLogs = Array.from({ length: 4800 }, (_, index) => ({
    interaction_id: id('INT', index + 1),
    live_id: liveSessions[index % 108].live_id,
    user_id: users[index % users.length].user_id,
    interaction_type: ['评论', '点赞', '加购', '关注'][index % 4],
    interaction_content: ['价格还能优惠吗', '已加购', '主播讲得很清楚', '库存还有多少'][index % 4],
    interaction_time: day(index % 78),
    sentiment_label: index % 9 === 0 ? '负向' : '正向',
    semantic_label: ['价格敏感', '购买意向', '产品咨询', '售后关注'][index % 4],
    confidence_score: pct(0.72 + (index % 20) / 100),
    purchase_intention: index % 4 === 1 ? '高' : '中',
    analysis_status: '已分析',
  }));

  const afterSales = Array.from({ length: 160 }, (_, index) => {
    const order = orders[(index * 13) % orders.length];
    return {
      aftersale_id: id('AFS', index + 1),
      order_id: order.order_id,
      aftersale_type: ['退货退款', '仅退款', '换货'][index % 3],
      problem_description: ['尺码不合适', '包装破损', '物流延迟', '色差咨询'][index % 4],
      process_status: ['待处理', '处理中', '已完成'][index % 3],
      refund_amount: money(Number(order.order_amount) * 0.7),
      complaint_level: ['低', '中', '高'][index % 3],
      create_time: day(20 + (index % 25)),
    };
  });

  const purchaseOrders = Array.from({ length: 180 }, (_, index) => {
    const sku = skus[(index * 5) % skus.length];
    const product = products.find((p) => p.product_id === sku.product_id)!;
    return {
      purchase_id: id('PUR', index + 1),
      supplier_id: product.supplier_id,
      sku_id: sku.sku_id,
      purchase_quantity: 200 + (index % 12) * 30,
      purchase_price: product.cost_price,
      purchase_status: ['待审核', '已下单', '已到货'][index % 3],
      expected_arrival_time: day(55 + (index % 20)),
      actual_arrival_time: index % 3 === 2 ? day(58 + (index % 20)) : null,
      purchaser_id: 'EMP003',
      create_time: day(35 + (index % 20)),
    };
  });

  const purchaseSuggestions = Array.from({ length: 60 }, (_, index) => {
    const sku = skus[(index * 7) % skus.length];
    return {
      suggestion_id: id('PSG', index + 1),
      sku_id: sku.sku_id,
      predicted_sales: 300 + (index % 20) * 26,
      suggested_quantity: 420 + (index % 15) * 30,
      stock_risk_level: ['低', '中', '高'][index % 3],
      suggestion_reason: '基于近60天直播销售、库存水位和供应商交付周期生成采购建议',
      generate_time: day(52 + (index % 8)),
    };
  });

  const userBehaviorStats = Array.from({ length: 240 }, (_, index) => ({
    stat_id: id('UBS', index + 1),
    live_id: liveSessions[index % 108].live_id,
    click_rate: pct(4.5 + (index % 12) * 0.35),
    conversion_rate: pct(2.2 + (index % 10) * 0.22),
    average_stay_time: pct(95 + (index % 40) * 5.5),
    bounce_rate: pct(18 + (index % 9) * 1.2),
    active_user_count: 260 + (index % 50) * 18,
    statistical_time: day(35 + (index % 30)),
  }));

  const anchorPerformances = liveSessions.slice(0, 108).map((session, index) => ({
    performance_id: id('AP', index + 1),
    anchor_id: session.anchor_id,
    live_id: session.live_id,
    conversion_rate: pct(2.8 + (index % 10) * 0.35),
    average_watch_time: pct(120 + (index % 20) * 8),
    interaction_rate: pct(8 + (index % 8) * 0.7),
    script_execution_score: pct(78 + (index % 16)),
    performance_score: pct(74 + (index % 20)),
    evaluation_time: day(45 + (index % 20)),
  }));

  const scripts = products.slice(0, 120).map((product, index) => {
    const session = liveSessions[index % 108];
    return {
      script_id: id('SCR', index + 1),
      product_id: product.product_id,
      live_id: session.live_id,
      anchor_id: session.anchor_id,
      script_title: `${product.product_name}直播讲解脚本`,
      script_content: `开场突出${product.category}痛点，展示${product.selling_points}，引导用户点击购物车并提示库存节奏。`,
      script_type: '商品讲解',
      tags: `${product.category},转化,验收`,
      conversion_rate: pct(2.5 + (index % 8) * 0.3),
      recommendation_level: ['A', 'B', 'C'][index % 3],
      create_time: day(25 + (index % 20)),
    };
  });

  const interfaceLogs = Array.from({ length: 120 }, (_, index) => ({
    log_id: id('LOG', index + 1),
    platform_name: PLATFORMS[index % PLATFORMS.length],
    interface_name: ['订单同步接口', '直播互动接口', '商品候选池接口', '物流状态接口'][index % 4],
    request_time: day(45 + (index % 18)),
    response_status: index % 17 === 0 ? '失败' : '成功',
    data_count: 80 + (index % 40) * 11,
    error_message: index % 17 === 0 ? '平台限流，已进入重试队列' : null,
  }));

  const reportTemplates = [
    {
      type: '周报',
      focus: '本周直播场次完成稳定，GMV 与订单量保持增长，重点场次的互动热度高于普通场次。',
      action: '下周优先复用高转化主播与脚本组合，并检查主推商品库存水位。',
    },
    {
      type: '月报',
      focus: '月度经营核心指标覆盖 GMV、订单、转化率、库存预警和主播绩效，适合管理层做资源复盘。',
      action: '将低库存高销量商品纳入采购建议，同时保留售后风险商品的降权观察。',
    },
    {
      type: '选品专项',
      focus: '选品评分综合转化、盈利、热度、趋势和售后质量，新品通过相似品和品类趋势进入冷启动评估。',
      action: '对高分在售商品加大排期，对待评估新品安排小流量试播并追踪早期信号。',
    },
    {
      type: '售后专项',
      focus: '售后工单按退款、退货、换货、投诉分级处理，高等级投诉需要优先闭环。',
      action: '把退款原因和投诉等级回流到商品质量、脚本话术和供应商履约评估。',
    },
  ];

  const operationReports = Array.from({ length: 12 }, (_, index) => {
    const template = reportTemplates[index % reportTemplates.length];
    return {
      report_id: id('RPT', index + 1),
      report_type: template.type,
      report_title: `直播电商运营验收报告${pad(index + 1, 2)}`,
      report_content: `一、核心结论\n${template.focus}\n二、数据依据\n报告汇总平台订单、直播互动、库存、采购、售后和商品表现数据，统计周期为2026年5月。\n三、异常与风险\n需要重点关注库存预警SKU、售后投诉等级较高的订单，以及趋势分下降的商品。\n四、行动建议\n${template.action}`,
      creator_id: EMPLOYEES[index % EMPLOYEES.length].employee_id,
      create_time: day(48 + index),
      statistical_period: '2026年5月',
    };
  });

  const kpiIndicators = [
    ['KPI001', 'GMV增长率', '财务', 15, '月度', '管理层'],
    ['KPI002', '直播转化率', '运营', 5, '场次', '运营人员'],
    ['KPI003', '库存周转天数', '供应链', 30, '月度', '仓储人员'],
    ['KPI004', '售后处理时效', '售后', 24, '日', '运营人员'],
  ].map(([indicator_id, indicator_name, indicator_type, target_value, statistical_period, applicable_role]) => ({
    indicator_id,
    indicator_name,
    indicator_type,
    target_value,
    statistical_period,
    applicable_role,
  }));

  return {
    roles: ROLES,
    permissions: PERMISSIONS,
    employees: EMPLOYEES,
    anchors,
    users,
    suppliers,
    products,
    skus,
    inventory,
    liveSessions,
    scripts,
    orders,
    interactionLogs,
    afterSales,
    purchaseOrders,
    purchaseSuggestions,
    anchorPerformances,
    productPerformances,
    userBehaviorStats,
    interfaceLogs,
    operationReports,
    kpiIndicators,
  };
}

async function insertBatches(knex: Knex, table: string, rows: any[], batchSize = 100) {
  if (rows.length === 0) return;
  await knex.batchInsert(table, rows, batchSize);
}

export async function seedAcceptanceData(knex: Knex) {
  const data = buildAcceptancePreview();
  // FK-safe delete order: children before parents; handle missing tables gracefully
  const clearOrder = [
    // Migration 003 tables (may not exist)
    'LivePlanItem', 'LivePlan', 'AnchorProductFit',
    // Migration 002 tables (may not exist)
    'LiveSessionMetrics', 'ProductReview', 'LiveSessionReview',
    // Leaf tables (no incoming FKs from other business tables)
    'UserBehaviorStat', 'InterfaceLog', 'OperationReport', 'KPIIndicator',
    'PurchaseSuggestion',
    // Children of LiveSession + Product + [Order]
    'ProductPerformance', 'AnchorPerformance',
    'AfterSale',        // → [Order]
    'InteractionLog',   // → LiveSession
    '[Order]',          // → LiveSession, SKU, User
    'Script',           // → Product, LiveSession
    'PurchaseOrder',    // → SKU, Supplier
    'Inventory',        // → SKU
    'SKU',              // → Product
    'Product',          // → Supplier
    'LiveSession',      // → Anchor
    // Reference tables
    'Supplier', 'EmployeeRole', 'RolePermission',
    'Anchor', 'User', 'Employee', 'Permission', 'Role',
  ];

  for (const table of clearOrder) {
    try {
      await knex(table).del();
    } catch {
      // Table may not exist (e.g. migration 002/003 not run) — skip
    }
  }

  const passwordHash = bcrypt.hashSync('123456', 10);
  await insertBatches(knex, 'Role', data.roles);
  await insertBatches(knex, 'Permission', data.permissions);
  // Permission matrix: 管理层(16) / 运营(16) / 采购(5) / 仓储(5) / 主播(7) / 管理员(20)
  // Indices: 0=看板查看 1=商品管理 2=主播管理 3=选品分析 4=采购管理 5=库存管理
  //          6=直播监控 7=脚本管理 8=数据分析 9=售后管理 10=报告查看 11=系统设置
  //          12=直播场次管理 13=采购建议查看 14=主播绩效查看 15=商品表现查看
  //          16=接口日志查看 17=AI脚本生成 18=AI弹幕分析 19=数字顾问报告
  const ROLE_PERM_MAP: Record<string, number[]> = {
    ROLE001: [0,1,2,3,6,7,8,9,10,12,13,14,15,17,18,19],                           // 管理层 — 16
    ROLE002: [0,1,2,3,6,7,8,9,10,12,13,14,15,17,18,19],                           // 运营人员 — 16
    ROLE003: [0,4,10,13,15],                                                       // 采购人员 — 5
    ROLE004: [0,5,10,13,15],                                                       // 仓储人员 — 5
    ROLE005: [0,6,7,8,14,17,18],                                                  // 主播 — 7 (数据分析替代报告查看)
    ROLE006: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],                 // 系统管理员 — 20
  };
  await insertBatches(knex, 'RolePermission', data.roles.flatMap((role) => {
    const indices = ROLE_PERM_MAP[role.role_id];
    return indices.map((idx) => ({
      relation_id: `${role.role_id}_${pad(idx + 1, 2)}`,
      role_id: role.role_id,
      permission_id: data.permissions[idx].permission_id,
    }));
  }));
  await insertBatches(knex, 'Employee', data.employees.map((employee, index) => ({
    employee_id: employee.employee_id,
    employee_name: employee.employee_name,
    department: employee.department,
    position: employee.position,
    phone: `1390000${pad(index + 1, 4)}`,
    email: `${employee.employee_id.toLowerCase()}@livehub.local`,
    status: '在职',
    join_date: '2024-01-01',
    password_hash: passwordHash,
    ...(employee.anchor_id ? { anchor_id: employee.anchor_id } : {}),
  })));
  await insertBatches(knex, 'EmployeeRole', data.employees.map((employee, index) => ({
    relation_id: id('ER', index + 1),
    employee_id: employee.employee_id,
    role_id: employee.role_id,
  })));
  await insertBatches(knex, 'Anchor', data.anchors);
  await insertBatches(knex, 'User', data.users);
  await insertBatches(knex, 'Supplier', data.suppliers);
  await insertBatches(knex, 'LiveSession', data.liveSessions);
  await insertBatches(knex, 'Product', data.products);
  await insertBatches(knex, 'SKU', data.skus);
  await insertBatches(knex, 'Inventory', data.inventory);
  await insertBatches(knex, 'Script', data.scripts);
  await insertBatches(knex, 'PurchaseOrder', data.purchaseOrders);
  await insertBatches(knex, '[Order]', data.orders);
  await insertBatches(knex, 'InteractionLog', data.interactionLogs);
  await insertBatches(knex, 'AfterSale', data.afterSales);
  await insertBatches(knex, 'AnchorPerformance', data.anchorPerformances);
  await insertBatches(knex, 'ProductPerformance', data.productPerformances);
  await insertBatches(knex, 'PurchaseSuggestion', data.purchaseSuggestions);
  await insertBatches(knex, 'KPIIndicator', data.kpiIndicators);
  await insertBatches(knex, 'OperationReport', data.operationReports);
  await insertBatches(knex, 'InterfaceLog', data.interfaceLogs);
  await insertBatches(knex, 'UserBehaviorStat', data.userBehaviorStats);

  return data;
}
