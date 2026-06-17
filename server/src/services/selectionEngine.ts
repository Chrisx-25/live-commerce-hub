import knex from '../db/knex';
import { assessNewProduct } from './llmService';

// Weight configuration
const WEIGHTS = {
  conversion: 0.25,
  profitability: 0.25,
  heat: 0.20,
  trend: 0.15,
  quality: 0.15,
};

export type TrendPeriod = 'recent' | 'previous';

export interface TrendMetricRow {
  period: TrendPeriod;
  sales_volume?: number | string | null;
  gmv?: number | string | null;
  conversion_rate?: number | string | null;
  interaction_heat?: number | string | null;
}

export type ColdStartConfidence = 'low' | 'medium' | 'high';

export interface ColdStartDecision {
  action: '加码试播' | '建议试播' | '继续观察' | '暂缓投放';
  confidence: ColdStartConfidence;
  reason: string;
}

type RankingLike = {
  product_id?: string;
  product_name: string;
  category: string;
  product_status?: string | null;
  sale_price?: number | string | null;
  gross_profit_rate?: number | string | null;
  scores: {
    conversion: number;
    profitability: number;
    heat: number;
    trend: number;
    quality: number;
    composite: number;
  };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const num = (value: number | string | null | undefined) => Number(value) || 0;

function growthRate(recent: number, previous: number) {
  if (previous <= 0 && recent <= 0) return 0;
  if (previous <= 0) return 1;
  return clamp((recent - previous) / previous, -1, 1);
}

export function calculateTrendScore(rows: TrendMetricRow[]) {
  if (rows.length === 0) return 60;

  const recent = rows.find((r) => r.period === 'recent');
  const previous = rows.find((r) => r.period === 'previous');
  if (!recent && !previous) return 60;
  if (recent && !previous) return 68;
  if (!recent && previous) return 45;

  const salesGrowth = growthRate(num(recent?.sales_volume), num(previous?.sales_volume));
  const gmvGrowth = growthRate(num(recent?.gmv), num(previous?.gmv));
  const conversionGrowth = growthRate(num(recent?.conversion_rate), num(previous?.conversion_rate));
  const heatGrowth = growthRate(num(recent?.interaction_heat), num(previous?.interaction_heat));
  const weightedGrowth = gmvGrowth * 0.35 + salesGrowth * 0.25 + conversionGrowth * 0.25 + heatGrowth * 0.15;

  return Math.round(clamp(60 + weightedGrowth * 30, 20, 95));
}

export function getTrendLabel(trendScore: number) {
  if (trendScore > 75) return '上升 ↗';
  if (trendScore < 45) return '下降 ↘';
  return '平稳';
}

export function isColdStartProduct(product: { product_status?: string | null; create_time?: string | Date | null }) {
  return product.product_status === '待评估';
}

export function calculateExplorationBoost(daysSinceCreate: number, trialCount = 0) {
  if (daysSinceCreate >= 14 || trialCount >= 6) return 0;

  const ageFactor = Math.exp(-0.28 * Math.max(0, daysSinceCreate));
  const trialFactor = Math.max(0.25, 1 - trialCount * 0.14);
  return Math.round(clamp(20 * ageFactor * trialFactor, 0, 20));
}

export function resolveColdStartDecision(
  estimatedScore: number,
  explorationBoost: number,
  trialCount: number
): ColdStartDecision {
  const decisionScore = estimatedScore + explorationBoost;
  const confidence: ColdStartConfidence = trialCount >= 6 ? 'high' : trialCount >= 3 ? 'medium' : 'low';

  if (decisionScore >= 90) {
    return {
      action: '加码试播',
      confidence,
      reason: '初评分和探索加权均较高，适合安排更靠前的直播资源并快速收集转化反馈。',
    };
  }

  if (decisionScore >= 72) {
    return {
      action: '建议试播',
      confidence,
      reason: '商品基础和相似品表现达到试播门槛，建议小流量验证真实转化。',
    };
  }

  if (decisionScore >= 58) {
    return {
      action: '继续观察',
      confidence,
      reason: '当前证据不足以直接加码，需要补充库存、卖点或首场反馈后再判断。',
    };
  }

  return {
    action: '暂缓投放',
    confidence,
    reason: '初评分低于新品试播门槛，建议先优化价格、库存、卖点或供应支持。',
  };
}

function daysSince(value: string | Date | null | undefined) {
  if (!value) return 0;
  const created = new Date(value);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
}

function weightedAverage(items: Array<{ value: number; weight: number }>, fallback: number) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return fallback;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function buildAdvisorReportSections(rankings: RankingLike[]) {
  const topProducts = [...rankings]
    .filter((p) => !isColdStartProduct(p))
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, 5);
  const coldStartCandidates = [...rankings]
    .filter(isColdStartProduct)
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, 5);
  const riskProducts = [...rankings]
    .filter((p) => p.scores.composite < 60 || p.scores.quality < 65)
    .sort((a, b) => a.scores.composite - b.scores.composite)
    .slice(0, 5);

  const categoryMap = rankings.reduce((acc: Record<string, { count: number; total: number; cold: number }>, item) => {
    if (!acc[item.category]) acc[item.category] = { count: 0, total: 0, cold: 0 };
    acc[item.category].count += 1;
    acc[item.category].total += item.scores.composite;
    if (isColdStartProduct(item)) acc[item.category].cold += 1;
    return acc;
  }, {});

  const categoryOpportunities = Object.entries(categoryMap)
    .map(([category, stats]) => ({
      category,
      productCount: stats.count,
      coldStartCount: stats.cold,
      avgScore: Math.round(stats.total / Math.max(stats.count, 1)),
      suggestion: stats.cold > 0
        ? '存在候选新品，建议安排小流量试播并跟踪首场转化。'
        : '以在售商品优化为主，优先复盘高分商品话术与库存。',
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  const executiveSummary = [
    `本次分析覆盖${rankings.length}个候选/在售商品，其中新品${coldStartCandidates.length}个进入冷启动观察。`,
    topProducts[0]
      ? `当前最适合加大直播资源的是「${topProducts[0].product_name}」，综合评分${topProducts[0].scores.composite}。`
      : '当前缺少可直接加码的在售商品，需要先补充商品表现数据。',
    riskProducts.length > 0
      ? `发现${riskProducts.length}个低分或售后风险商品，建议复核价格、库存和售后原因。`
      : '未发现明显低分风险商品，可继续按现有节奏监控。',
  ];

  const actionItems = [
    coldStartCandidates[0]
      ? `新品试播：优先对「${coldStartCandidates[0].product_name}」做冷启动评估，安排1-3场小流量试播。`
      : '新品试播：当前无待评估新品，先维护供应商候选池。',
    topProducts[0]
      ? `资源加码：将「${topProducts[0].product_name}」纳入近期重点直播排期，检查库存是否支撑放量。`
      : '资源加码：等待选品评分产生稳定高分商品后再安排重点排期。',
    riskProducts[0]
      ? `风险处理：复核「${riskProducts[0].product_name}」的转化、毛利或售后表现，必要时降权或下架。`
      : '风险处理：继续监控退款率和负面反馈，无需立即下架。',
  ];

  return {
    generatedAt: new Date().toISOString(),
    dataBasis: '基于当前Product、SKU、Inventory、Supplier、ProductPerformance和选品评分生成',
    executiveSummary,
    topProducts: topProducts.map((p) => ({
      product_name: p.product_name,
      category: p.category,
      score: p.scores.composite,
      reason: `综合评分${p.scores.composite}，转化${p.scores.conversion}/盈利${p.scores.profitability}/热度${p.scores.heat}`,
    })),
    coldStartCandidates: coldStartCandidates.map((p) => ({
      product_id: p.product_id,
      product_name: p.product_name,
      category: p.category,
      score: p.scores.composite,
      reason: `状态为待评估，需通过冷启动评估和小流量试播验证真实转化。`,
    })),
    categoryOpportunities,
    riskProducts: riskProducts.map((p) => ({
      product_name: p.product_name,
      category: p.category,
      score: p.scores.composite,
      reason: p.scores.quality < 65 ? '售后质量偏低，需要关注退款和负面反馈。' : '综合评分低于试播/加码门槛。',
    })),
    actionItems,
  };
}

async function getProductTrendScore(productId: string) {
  const latest = await knex('ProductPerformance')
    .join('LiveSession', 'ProductPerformance.live_id', 'LiveSession.live_id')
    .where('ProductPerformance.product_id', productId)
    .max('LiveSession.start_time as latest_time')
    .first();

  if (!latest?.latest_time) return 60;

  const latestTime = new Date(latest.latest_time);
  const recentStart = new Date(latestTime);
  recentStart.setDate(recentStart.getDate() - 30);
  const previousStart = new Date(latestTime);
  previousStart.setDate(previousStart.getDate() - 60);

  const selectTrendStats = () => knex('ProductPerformance')
    .join('LiveSession', 'ProductPerformance.live_id', 'LiveSession.live_id')
    .where('ProductPerformance.product_id', productId)
    .sum('ProductPerformance.sales_volume as sales_volume')
    .sum('ProductPerformance.gmv as gmv')
    .avg('ProductPerformance.conversion_rate as conversion_rate')
    .avg('ProductPerformance.interaction_heat as interaction_heat')
    .first();

  const [recent, previous] = await Promise.all([
    selectTrendStats().where('LiveSession.start_time', '>=', recentStart),
    selectTrendStats()
      .where('LiveSession.start_time', '>=', previousStart)
      .where('LiveSession.start_time', '<', recentStart),
  ]);

  const rows: TrendMetricRow[] = [];
  if (recent?.sales_volume || recent?.gmv) rows.push({ period: 'recent', ...recent });
  if (previous?.sales_volume || previous?.gmv) rows.push({ period: 'previous', ...previous });

  return calculateTrendScore(rows);
}

// Category-wise averages (runtime computed)
async function getCategoryAverages(category: string) {
  const stats = await knex('ProductPerformance')
    .join('Product', 'ProductPerformance.product_id', 'Product.product_id')
    .where('Product.category', category)
    .avg('ProductPerformance.conversion_rate as avg_conversion')
    .avg('ProductPerformance.click_rate as avg_click')
    .avg('ProductPerformance.interaction_heat as avg_heat')
    .first();

  const prices = await knex('Product')
    .where('category', category)
    .where('product_status', '在售')
    .avg('sale_price as avg_price')
    .first();

  return {
    avgConversion: Number(stats?.avg_conversion) || 3,
    avgClick: Number(stats?.avg_click) || 5,
    avgHeat: Number(stats?.avg_heat) || 50,
    avgPrice: Number(prices?.avg_price) || 100,
  };
}

export async function getProductRankings(category?: string, sortBy?: string, search?: string) {
  let query = knex('Product')
    .leftJoin('ProductPerformance', 'Product.product_id', 'ProductPerformance.product_id')
    .select(
      'Product.*',
      knex.raw('AVG(ProductPerformance.conversion_rate) as avg_conversion'),
      knex.raw('AVG(ProductPerformance.click_rate) as avg_click'),
      knex.raw('AVG(ProductPerformance.interaction_heat) as avg_heat'),
      knex.raw('AVG(ProductPerformance.refund_rate) as avg_refund'),
      knex.raw('SUM(ProductPerformance.sales_volume) as total_sales_volume'),
      knex.raw('SUM(ProductPerformance.gmv) as total_gmv')
    )
    .whereIn('Product.product_status', ['在售', '待评估'])
    .groupBy(
      'Product.product_id', 'Product.product_name', 'Product.category',
      'Product.brand', 'Product.cost_price', 'Product.sale_price',
      'Product.gross_profit_rate', 'Product.product_status',
      'Product.supplier_id', 'Product.description', 'Product.selling_points',
      'Product.create_time'
    );

  if (category) {
    query = query.where('Product.category', category);
  }
  if (search) {
    query = query.where('Product.product_name', 'like', `%${search}%`);
  }

  const products = await query;

  // Calculate scores for each product
  const scored = [];
  for (const p of products) {
    const avgs = await getCategoryAverages(p.category);

    // 1. Conversion Score (0-100)
    const convRate = Number(p.avg_conversion) || 1;
    const clickRate = Number(p.avg_click) || 1;
    const heat = Number(p.avg_heat) || 1;
    const conversionScore = Math.min(
      ((convRate / Math.max(avgs.avgConversion, 0.1)) * 0.5 +
        (clickRate / Math.max(avgs.avgClick, 0.1)) * 0.3 +
        (heat / Math.max(avgs.avgHeat, 0.1)) * 0.2) * 100,
      100
    );

    // 2. Profitability Score
    const gpRate = Number(p.gross_profit_rate) || 30;
    const price = Number(p.sale_price) || 100;
    const refundRate = Number(p.avg_refund) || 0;
    const profitabilityScore = Math.min(
      ((gpRate / 50) * 0.4 +
        Math.min(price / Math.max(avgs.avgPrice, 1), 2) * 0.3 +
        (1 - Math.min(refundRate / 20, 1)) * 0.3) * 100,
      100
    );

    // 3. Heat Score
    const salesVol = Number(p.total_sales_volume) || 0;
    const gmv = Number(p.total_gmv) || 0;
    const heatScore = Math.min(
      (Math.min(salesVol / 500, 1) * 0.5 + Math.min(gmv / 50000, 1) * 0.3 + Math.min(heat / 200, 1) * 0.2) * 100,
      100
    );

    // 4. Trend Score: deterministic recent-vs-previous performance comparison
    const trendScore = await getProductTrendScore(p.product_id);

    // 5. Quality Score
    const qualityScore = Math.min(
      ((1 - Math.min(refundRate / 10, 1)) * 0.6 + 0.4) * 100,
      100
    );

    // Composite Score
    const compositeScore =
      conversionScore * WEIGHTS.conversion +
      profitabilityScore * WEIGHTS.profitability +
      heatScore * WEIGHTS.heat +
      trendScore * WEIGHTS.trend +
      qualityScore * WEIGHTS.quality;

    // Trend label
    const trendLabel = getTrendLabel(trendScore);

    scored.push({
      ...p,
      isColdStartCandidate: isColdStartProduct(p),
      scores: {
        conversion: Math.round(conversionScore),
        profitability: Math.round(profitabilityScore),
        heat: Math.round(heatScore),
        trend: Math.round(trendScore),
        quality: Math.round(qualityScore),
        composite: Math.round(compositeScore),
      },
      trendLabel,
    });
  }

  // Sort
  if (sortBy === 'conversion') scored.sort((a, b) => b.scores.conversion - a.scores.conversion);
  else if (sortBy === 'profitability') scored.sort((a, b) => b.scores.profitability - a.scores.profitability);
  else if (sortBy === 'heat') scored.sort((a, b) => b.scores.heat - a.scores.heat);
  else scored.sort((a, b) => b.scores.composite - a.scores.composite);

  return scored;
}

// Jaccard similarity for association recommendations
export async function getRecommendations(productId: string) {
  // Find users who bought this product
  const buyerQuery = await knex('[Order]')
    .join('SKU', '[Order].sku_id', 'SKU.sku_id')
    .where('SKU.product_id', productId)
    .select('[Order].user_id')
    .distinct();

  const buyers = buyerQuery.map((b: any) => b.user_id);
  if (buyers.length === 0) return [];

  // Find other products bought by these users
  const coBought = await knex('[Order]')
    .join('SKU', '[Order].sku_id', 'SKU.sku_id')
    .join('Product', 'SKU.product_id', 'Product.product_id')
    .whereIn('[Order].user_id', buyers)
    .whereNot('SKU.product_id', productId)
    .select('Product.product_id', 'Product.product_name', 'Product.category', 'Product.sale_price')
    .count('* as co_count')
    .groupBy('Product.product_id', 'Product.product_name', 'Product.category', 'Product.sale_price')
    .orderBy('co_count', 'desc')
    .limit(10);

  return coBought.map((item: any) => ({
    ...item,
    co_count: Number(item.co_count),
    jaccard: parseFloat((Number(item.co_count) / buyers.length).toFixed(3)),
  }));
}

// Category trends
export async function getCategoryTrends() {
  const categories = await knex('Product as P')
    .leftJoin('SKU', 'P.product_id', 'SKU.product_id')
    .leftJoin('[Order]', 'SKU.sku_id', '[Order].sku_id')
    .select('P.category')
    .countDistinct('P.product_id as product_count')
    .sum('[Order].order_amount as total_gmv')
    .groupBy('P.category');

  return categories;
}

// Advisor report
export async function getAdvisorReport() {
  const rankings = await getProductRankings();
  return buildAdvisorReportSections(rankings);
}

// Cold start for new products
export async function coldStart(productId: string) {
  const product = await knex('Product').where('product_id', productId).first();
  if (!product) throw new Error('Product not found');

  // Candidate products are evaluated from internal product attributes first, then updated by trial data.
  const similar = await knex('Product')
    .leftJoin('ProductPerformance', 'Product.product_id', 'ProductPerformance.product_id')
    .select(
      'Product.*',
      knex.raw('AVG(ProductPerformance.conversion_rate) as avg_conversion'),
      knex.raw('AVG(ProductPerformance.click_rate) as avg_click'),
      knex.raw('AVG(ProductPerformance.interaction_heat) as avg_heat'),
      knex.raw('AVG(ProductPerformance.refund_rate) as avg_refund'),
      knex.raw('SUM(ProductPerformance.gmv) as total_gmv')
    )
    .where('Product.category', product.category)
    .where('Product.product_status', '在售')
    .whereNot('Product.product_id', productId)
    .groupBy(
      'Product.product_id', 'Product.product_name', 'Product.category',
      'Product.brand', 'Product.cost_price', 'Product.sale_price',
      'Product.gross_profit_rate', 'Product.product_status',
      'Product.supplier_id', 'Product.description', 'Product.selling_points',
      'Product.create_time'
    )
    .limit(20);

  const scored = similar.map((sp: any) => {
    const priceDiff = Math.abs(parseFloat(sp.sale_price) - parseFloat(product.sale_price));
    const priceSim = Math.max(0, 1 - priceDiff / parseFloat(product.sale_price || 1));
    const brandMatch = sp.brand === product.brand ? 1 : 0;
    const marginDiff = Math.abs(num(sp.gross_profit_rate) - num(product.gross_profit_rate));
    const marginSim = Math.max(0, 1 - marginDiff / 50);
    const similarity = priceSim * 0.45 + brandMatch * 0.25 + marginSim * 0.15 + 0.15;
    const performanceScore = clamp(
      num(sp.avg_conversion) * 12 + num(sp.avg_click) * 4 + Math.min(num(sp.avg_heat), 100) * 0.25
        + Math.min(num(sp.total_gmv) / 1200, 20) - Math.min(num(sp.avg_refund), 20),
      35,
      95
    );
    return {
      ...sp,
      similarity: parseFloat(similarity.toFixed(3)),
      performanceScore: Math.round(performanceScore),
    };
  }).sort((a: any, b: any) => b.similarity - a.similarity).slice(0, 5);

  const categoryStats = await knex('ProductPerformance')
    .join('Product', 'ProductPerformance.product_id', 'Product.product_id')
    .where('Product.category', product.category)
    .avg('ProductPerformance.conversion_rate as avg_conv')
    .avg('ProductPerformance.click_rate as avg_click')
    .avg('ProductPerformance.interaction_heat as avg_heat')
    .avg('ProductPerformance.refund_rate as avg_refund')
    .sum('ProductPerformance.gmv as total_gmv')
    .first();

  const supplier = product.supplier_id
    ? await knex('Supplier').where('supplier_id', product.supplier_id).first()
    : null;

  const stock = await knex('SKU')
    .leftJoin('Inventory', 'SKU.sku_id', 'Inventory.sku_id')
    .where('SKU.product_id', productId)
    .sum('SKU.stock_quantity as sku_stock')
    .sum('Inventory.current_stock as warehouse_stock')
    .first();

  const trialStats = await knex('ProductPerformance')
    .where('product_id', productId)
    .count('* as trial_count')
    .avg('conversion_rate as avg_conversion')
    .avg('click_rate as avg_click')
    .avg('interaction_heat as avg_heat')
    .avg('refund_rate as avg_refund')
    .sum('gmv as total_gmv')
    .first();

  const trialCount = num(trialStats?.trial_count);
  const similarScore = Math.round(weightedAverage(
    scored.map((item: any) => ({ value: num(item.performanceScore), weight: num(item.similarity) })),
    55
  ));
  const categoryScore = Math.round(clamp(
    num(categoryStats?.avg_conv) * 10 + num(categoryStats?.avg_click) * 3 + Math.min(num(categoryStats?.avg_heat), 100) * 0.25
      + Math.min(num(categoryStats?.total_gmv) / 10000, 18) - Math.min(num(categoryStats?.avg_refund), 18),
    35,
    90
  ));
  const supplierScore = Math.round(clamp(
    (num(supplier?.supplier_score) || 70) * 0.75 + (supplier?.delivery_cycle ? Math.max(0, 100 - num(supplier.delivery_cycle) * 6) : 70) * 0.25,
    35,
    95
  ));
  const inventoryTotal = num(stock?.sku_stock) + num(stock?.warehouse_stock);
  const inventoryScore = Math.round(clamp(45 + Math.min(inventoryTotal / 20, 35), 30, 90));
  const marginScore = Math.round(clamp(num(product.gross_profit_rate) * 1.8, 30, 90));
  const trialSignalScore = trialCount > 0
    ? Math.round(clamp(
      num(trialStats?.avg_conversion) * 12 + num(trialStats?.avg_click) * 4 + Math.min(num(trialStats?.avg_heat), 100) * 0.25
        + Math.min(num(trialStats?.total_gmv) / 1000, 18) - Math.min(num(trialStats?.avg_refund), 18),
      30,
      95
    ))
    : 55;

  const estimatedScore = Math.round(clamp(
    similarScore * 0.28
      + categoryScore * 0.18
      + supplierScore * 0.18
      + inventoryScore * 0.14
      + marginScore * 0.12
      + trialSignalScore * 0.10,
    30,
    95
  ));
  const explorationBoost = calculateExplorationBoost(daysSince(product.create_time), trialCount);
  const decision = resolveColdStartDecision(estimatedScore, explorationBoost, trialCount);

  const trendSummary = `品类${product.category}，近30天平均转化率${Number(categoryStats?.avg_conv || 0).toFixed(2)}%，累计GMV¥${Number(categoryStats?.total_gmv || 0).toFixed(0)}`;

  const llmAssessment = await assessNewProduct(product, trendSummary);

  return {
    product,
    similarProducts: scored,
    llmAssessment,
    estimatedScore,
    explorationBoost,
    confidence: decision.confidence,
    decision,
    trialCount,
    scoreComponents: {
      similarProducts: similarScore,
      categoryTrend: categoryScore,
      supplierReadiness: supplierScore,
      inventoryReadiness: inventoryScore,
      grossMargin: marginScore,
      trialSignal: trialSignalScore,
    },
    baselines: {
      categoryAvgConversion: Number(categoryStats?.avg_conv || 0).toFixed(2),
      categoryAvgClick: Number(categoryStats?.avg_click || 0).toFixed(2),
      categoryAvgHeat: Number(categoryStats?.avg_heat || 0).toFixed(1),
      categoryAvgRefund: Number(categoryStats?.avg_refund || 0).toFixed(2),
      categoryTotalGmv: Math.round(num(categoryStats?.total_gmv)),
      inventoryTotal,
      supplierScore: supplier?.supplier_score ?? null,
      deliveryCycle: supplier?.delivery_cycle ?? null,
    },
    trialStrategy: {
      targetSessions: trialCount >= 3 ? '已具备早期复盘基础' : '建议完成1-3场小流量试播',
      trafficPolicy: explorationBoost > 0 ? `给予${explorationBoost}分探索加权，随试播次数和上架时间衰减` : '停止探索加权，进入常规选品评分',
      reviewMetrics: ['点击率', '互动热度', '转化率', 'GMV', '退款率', '负面弹幕'],
    },
    executionSuggestions: {
      anchor: `${product.category}专长主播优先，首场选择稳定转化型主播`,
      timeSlot: '优先安排在同品类历史成交较稳的腰部时段，避免直接占用大促峰值资源',
      scriptAngle: product.selling_points || '围绕价格带、核心卖点、使用场景和风险答疑组织话术',
    },
  };
}
