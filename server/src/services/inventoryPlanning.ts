import knex from '../db/knex';

const num = (value: number | string | null | undefined) => Number(value) || 0;

export interface InventoryPlanningInput {
  currentStock: number;
  safetyStock: number;
  warningThreshold: number;
  salesVolume90Days: number;
  supplierDeliveryCycle: number;
  inboundPurchaseQuantity: number;
  upcomingLiveDemand: number;
  productPotentialScore: number;
  isColdStartCandidate: boolean;
}

export interface InventoryPlan {
  source: InventoryPlanningInput;
  predictedSales30Days: number;
  leadTimeDemand: number;
  reorderPoint: number;
  availableStock: number;
  suggestedQuantity: number;
  stockRiskLevel: '高' | '中' | '低';
  stockRiskScore: number;
  riskReasons: string[];
}

export function calculateInventoryPlan(input: InventoryPlanningInput): InventoryPlan {
  const dailyAverage = Math.max(input.salesVolume90Days / 90, input.isColdStartCandidate ? 2 : 1);
  const predictedSales30Days = Math.ceil(dailyAverage * 30);
  const leadTimeDemand = Math.ceil(dailyAverage * Math.max(input.supplierDeliveryCycle, 1));
  const liveDemand = Math.max(0, input.upcomingLiveDemand);
  const coldStartReserve = input.isColdStartCandidate ? 60 : 0;
  const demandBuffer = input.productPotentialScore >= 85 ? Math.ceil(predictedSales30Days * 0.35) : 0;
  const reorderPoint = input.safetyStock + leadTimeDemand + liveDemand + coldStartReserve + demandBuffer;
  const availableStock = input.currentStock + input.inboundPurchaseQuantity;
  const targetStock = reorderPoint + Math.max(input.safetyStock, input.warningThreshold);
  const suggestedQuantity = Math.max(0, Math.ceil(targetStock - availableStock));

  const riskReasons: string[] = [];
  if (availableStock <= reorderPoint) {
    riskReasons.push(`可用库存${availableStock}低于动态补货点${reorderPoint}`);
  }
  if (liveDemand > 0) {
    riskReasons.push(`未来直播预计占用${liveDemand}件备货`);
  }
  if (input.productPotentialScore >= 85) {
    riskReasons.push(`商品潜力分${input.productPotentialScore}，存在爆款放量风险`);
  }
  if (input.isColdStartCandidate) {
    riskReasons.push('新品试播需预留基础库存');
  }
  if (input.supplierDeliveryCycle >= 7) {
    riskReasons.push(`供应商交期${input.supplierDeliveryCycle}天，需要提前下单`);
  }
  if (input.inboundPurchaseQuantity > 0) {
    riskReasons.push(`已有在途采购${input.inboundPurchaseQuantity}件，已从建议量中扣减`);
  }
  if (riskReasons.length === 0) {
    riskReasons.push('库存覆盖当前销售和直播计划');
  }

  const gap = reorderPoint - availableStock;
  let stockRiskLevel: InventoryPlan['stockRiskLevel'] = '低';
  if (gap > input.safetyStock || (input.currentStock <= 0 && liveDemand > 0)) stockRiskLevel = '高';
  else if (gap > input.safetyStock * 0.5 || liveDemand > availableStock) stockRiskLevel = '高';
  else if (gap > 0 || ((input.productPotentialScore >= 85 || input.isColdStartCandidate) && suggestedQuantity > 0)) stockRiskLevel = '中';

  const stockRiskScore = stockRiskLevel === '高' ? 3 : stockRiskLevel === '中' ? 2 : 1;

  return {
    source: input,
    predictedSales30Days,
    leadTimeDemand,
    reorderPoint,
    availableStock,
    suggestedQuantity,
    stockRiskLevel,
    stockRiskScore,
    riskReasons,
  };
}

export async function buildInventoryPlans(rows: any[]) {
  if (rows.length === 0) return [];

  const skuIds = rows.map((row) => row.sku_id).filter(Boolean);
  const productIds = rows.map((row) => row.product_id).filter(Boolean);
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))];

  const [inboundRows, performanceRows, liveRows] = await Promise.all([
    knex('PurchaseOrder')
      .select('sku_id')
      .sum('purchase_quantity as inbound_quantity')
      .whereIn('sku_id', skuIds)
      .whereIn('purchase_status', ['待审核', '已审核', '已发货'])
      .groupBy('sku_id'),
    knex('ProductPerformance')
      .select('product_id')
      .sum('sales_volume as sales_volume')
      .avg('conversion_rate as conversion_rate')
      .avg('interaction_heat as interaction_heat')
      .sum('gmv as gmv')
      .whereIn('product_id', productIds)
      .groupBy('product_id'),
    knex('LiveSession')
      .leftJoin('Anchor', 'LiveSession.anchor_id', 'Anchor.anchor_id')
      .select('LiveSession.live_category as category')
      .sum(knex.raw('CASE WHEN Anchor.anchor_level = ? THEN 180 WHEN Anchor.fan_count >= ? THEN 150 ELSE 80 END', ['S', 3000000]) as any)
      .whereIn('LiveSession.live_category', categories)
      .whereIn('LiveSession.live_status', ['已排期', '进行中'])
      .groupBy('LiveSession.live_category'),
  ]);

  const inboundBySku = new Map(inboundRows.map((row: any) => [row.sku_id, num(row.inbound_quantity)]));
  const performanceByProduct = new Map(performanceRows.map((row: any) => [row.product_id, row]));
  const liveDemandByCategory = new Map(liveRows.map((row: any) => [row.category, num(row[''] ?? row[0] ?? row.live_demand)]));

  return rows.map((row) => {
    const performance = performanceByProduct.get(row.product_id) || {};
    const potentialScore = Math.round(Math.min(
      95,
      Math.max(
        45,
        num(performance.conversion_rate) * 12
          + Math.min(num(performance.interaction_heat), 100) * 0.35
          + Math.min(num(performance.gmv) / 1500, 25)
      )
    ));
    const liveDemand = liveDemandByCategory.get(row.category) || 0;
    const plan = calculateInventoryPlan({
      currentStock: num(row.current_stock),
      safetyStock: num(row.safety_stock),
      warningThreshold: num(row.warning_threshold),
      salesVolume90Days: num(row.sales_volume),
      supplierDeliveryCycle: num(row.delivery_cycle) || 7,
      inboundPurchaseQuantity: inboundBySku.get(row.sku_id) || 0,
      upcomingLiveDemand: liveDemand,
      productPotentialScore: potentialScore,
      isColdStartCandidate: row.product_status === '待评估',
    });

    return {
      ...row,
      predicted_sales_30d: plan.predictedSales30Days,
      lead_time_demand: plan.leadTimeDemand,
      reorder_point: plan.reorderPoint,
      available_stock: plan.availableStock,
      inbound_purchase_quantity: plan.source.inboundPurchaseQuantity,
      upcoming_live_demand: plan.source.upcomingLiveDemand,
      product_potential_score: plan.source.productPotentialScore,
      suggested_quantity: plan.suggestedQuantity,
      stock_risk_level: plan.stockRiskLevel,
      stock_risk_score: plan.stockRiskScore,
      suggestion_reason: plan.riskReasons.join('；'),
    };
  });
}
