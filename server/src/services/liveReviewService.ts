import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { buildLiveReviewAnalysis, type LiveReviewInput, type LiveReviewProductInput } from './liveReviewEngine';

function id(prefix: string) {
  return `${prefix}${uuid().replace(/-/g, '').substring(0, 12)}`;
}

function n(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJson(value: any, fallback: any) {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function minutesBetween(start?: string | Date, end?: string | Date) {
  if (!start || !end) return 0;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff > 0 ? Math.round((diff / 60000) * 100) / 100 : 0;
}

async function getPlannedTargets(session: any) {
  const category = session.live_category || '';
  const baseline = await knex('LiveSession')
    .where('live_status', '\u5df2\u7ed3\u675f')
    .modify((query) => {
      if (category) query.where('live_category', category);
      query.whereNot('live_id', session.live_id);
    })
    .avg('total_sales as avg_gmv')
    .avg('online_peak as avg_peak')
    .first();

  const actualGmv = n(session.total_sales);
  const actualPeak = n(session.online_peak);
  const duration = minutesBetween(session.start_time, session.end_time) || 120;

  return {
    plannedGmv: Math.max(n(baseline?.avg_gmv), actualGmv * 1.08, 1000),
    plannedPeakOnline: Math.max(n(baseline?.avg_peak), actualPeak * 1.05, 500),
    plannedConversionRate: 4,
    plannedDurationMinutes: Math.max(duration, 90),
  };
}

async function getProductInputs(liveId: string): Promise<LiveReviewProductInput[]> {
  const performanceRows = await knex('ProductPerformance')
    .join('Product', 'ProductPerformance.product_id', 'Product.product_id')
    .where('ProductPerformance.live_id', liveId)
    .select(
      'Product.product_id',
      'Product.product_name',
      'Product.category',
      'ProductPerformance.sales_volume',
      'ProductPerformance.gmv',
      'ProductPerformance.click_rate',
      'ProductPerformance.conversion_rate',
      'ProductPerformance.refund_rate',
      'ProductPerformance.interaction_heat',
    );

  if (performanceRows.length > 0) {
    return performanceRows.map((row: any) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      category: row.category,
      sales_volume: n(row.sales_volume),
      gmv: n(row.gmv),
      click_rate: n(row.click_rate),
      conversion_rate: n(row.conversion_rate),
      refund_rate: n(row.refund_rate),
      interaction_heat: n(row.interaction_heat),
    }));
  }

  const orderRows = await knex('[Order]')
    .join('SKU', '[Order].sku_id', 'SKU.sku_id')
    .join('Product', 'SKU.product_id', 'Product.product_id')
    .where('[Order].live_id', liveId)
    .groupBy('Product.product_id', 'Product.product_name', 'Product.category')
    .select('Product.product_id', 'Product.product_name', 'Product.category')
    .sum('[Order].order_quantity as sales_volume')
    .sum('[Order].order_amount as gmv');

  return orderRows.map((row: any) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    category: row.category,
    sales_volume: n(row.sales_volume),
    gmv: n(row.gmv),
    click_rate: 0,
    conversion_rate: 0,
    refund_rate: 0,
    interaction_heat: 0,
  }));
}

async function getFunnel(liveId: string, session: any, productInputs: LiveReviewProductInput[]) {
  const latestBehavior = await knex('UserBehaviorStat')
    .where('live_id', liveId)
    .orderBy('statistical_time', 'desc')
    .first();

  const orderStats = await knex('[Order]')
    .where('live_id', liveId)
    .count('* as orders')
    .countDistinct('user_id as buyers')
    .first();

  const orders = n(orderStats?.orders);
  const buyers = n(orderStats?.buyers);
  const activeUsers = n(latestBehavior?.active_user_count);
  const viewers = Math.max(activeUsers, n(session.online_peak), buyers, 1);
  const averageClickRate = productInputs.length
    ? productInputs.reduce((sum, item) => sum + n(item.click_rate), 0) / productInputs.length
    : n(latestBehavior?.click_rate);
  const productClicks = Math.max(Math.round(viewers * (averageClickRate || 18) / 100), orders, 1);
  const exposure = Math.max(Math.round(viewers / ((n(latestBehavior?.click_rate) || 28) / 100)), viewers, 1);

  return {
    exposure,
    viewers,
    productClicks,
    orders,
    buyers,
  };
}

async function getAnchorInput(liveId: string, session: any) {
  const row = await knex('AnchorPerformance')
    .join('Anchor', 'AnchorPerformance.anchor_id', 'Anchor.anchor_id')
    .where('AnchorPerformance.live_id', liveId)
    .select('AnchorPerformance.*', 'Anchor.anchor_name')
    .first();

  if (row) {
    return {
      anchor_id: row.anchor_id,
      anchor_name: row.anchor_name,
      conversion_rate: n(row.conversion_rate),
      average_watch_time: n(row.average_watch_time),
      interaction_rate: n(row.interaction_rate),
      script_execution_score: n(row.script_execution_score),
      performance_score: n(row.performance_score),
    };
  }

  const anchor = await knex('Anchor').where('anchor_id', session.anchor_id).first();
  return {
    anchor_id: session.anchor_id,
    anchor_name: anchor?.anchor_name || '',
    conversion_rate: 0,
    average_watch_time: 0,
    interaction_rate: 0,
    script_execution_score: 0,
    performance_score: 0,
  };
}

async function getInteractions(liveId: string) {
  const rows = await knex('InteractionLog')
    .where('live_id', liveId)
    .select('sentiment_label', 'purchase_intention');

  return rows.reduce((acc, row: any) => {
    acc.total += 1;
    if (row.sentiment_label === '\u6b63\u9762') acc.positive += 1;
    else if (row.sentiment_label === '\u8d1f\u9762') acc.negative += 1;
    else acc.neutral += 1;
    if (String(row.purchase_intention || '').includes('\u9ad8') || String(row.purchase_intention || '').includes('\u662f')) {
      acc.purchaseIntent += 1;
    }
    return acc;
  }, { total: 0, positive: 0, neutral: 0, negative: 0, purchaseIntent: 0 });
}

async function buildReviewInput(liveId: string): Promise<LiveReviewInput> {
  const session = await knex('LiveSession')
    .join('Anchor', 'LiveSession.anchor_id', 'Anchor.anchor_id')
    .where('LiveSession.live_id', liveId)
    .select('LiveSession.*', 'Anchor.anchor_name')
    .first();
  if (!session) throw new Error('\u76f4\u64ad\u573a\u6b21\u4e0d\u5b58\u5728');

  const productInputs = await getProductInputs(liveId);
  const productGmv = productInputs.reduce((sum, item) => sum + item.gmv, 0);
  const targets = await getPlannedTargets(session);
  const funnel = await getFunnel(liveId, session, productInputs);
  const anchor = await getAnchorInput(liveId, session);
  const interactions = await getInteractions(liveId);
  const duration = minutesBetween(session.start_time, session.end_time) || targets.plannedDurationMinutes;

  return {
    session: {
      live_id: session.live_id,
      live_title: session.live_title,
      live_category: session.live_category,
      planned_gmv: targets.plannedGmv,
      planned_peak_online: targets.plannedPeakOnline,
      planned_conversion_rate: targets.plannedConversionRate,
      planned_duration_minutes: targets.plannedDurationMinutes,
      actual_gmv: Math.max(n(session.total_sales), productGmv),
      actual_peak_online: n(session.online_peak),
      actual_duration_minutes: duration,
    },
    funnel,
    products: productInputs,
    anchor,
    interactions,
  };
}

export async function generateLiveSessionReview(liveId: string) {
  const input = await buildReviewInput(liveId);
  const analysis = buildLiveReviewAnalysis(input);
  const reviewId = id('REV');
  const now = new Date();
  const existing = await knex('LiveSessionReview').where('live_id', liveId).first();
  const payload = {
    review_id: existing?.review_id || reviewId,
    live_id: liveId,
    anchor_id: input.anchor?.anchor_id || null,
    planned_gmv: analysis.core.plannedGmv,
    actual_gmv: analysis.core.actualGmv,
    gmv_achievement_rate: analysis.core.gmvAchievement,
    planned_peak_online: analysis.core.plannedPeakOnline,
    actual_peak_online: analysis.core.actualPeakOnline,
    traffic_achievement_rate: analysis.core.trafficAchievement,
    planned_conversion_rate: analysis.core.plannedConversionRate,
    actual_conversion_rate: analysis.core.actualConversionRate,
    planned_duration_minutes: analysis.core.plannedDurationMinutes,
    actual_duration_minutes: analysis.core.actualDurationMinutes,
    overall_score: analysis.score.value,
    grade: analysis.score.grade,
    funnel_json: JSON.stringify(analysis.funnel),
    anchor_json: JSON.stringify(analysis.anchor),
    diagnosis_json: JSON.stringify(analysis.diagnosis),
    suggestions_json: JSON.stringify(analysis.suggestions),
    summary: analysis.summary,
    updated_time: now,
  };

  if (existing) {
    await knex('LiveSessionReview').where('review_id', existing.review_id).update(payload);
    await knex('ProductReview').where('review_id', existing.review_id).del();
  } else {
    await knex('LiveSessionReview').insert({ ...payload, generated_time: now });
  }

  const savedReviewId = existing?.review_id || reviewId;
  const productRows = analysis.productContribution.products.map((product: any) => ({
    product_review_id: id('PR'),
    review_id: savedReviewId,
    live_id: liveId,
    product_id: product.product_id,
    product_name: product.product_name,
    sales_volume: product.sales_volume,
    gmv: product.gmv,
    contribution_rate: product.contributionRate,
    click_rate: product.click_rate,
    conversion_rate: product.conversion_rate,
    refund_rate: product.refund_rate,
    interaction_heat: product.interaction_heat,
    review_role: product.role,
    conclusion: buildProductConclusion(product),
  }));
  if (productRows.length > 0) await knex('ProductReview').insert(productRows);

  return getLiveSessionReview(savedReviewId);
}

function buildProductConclusion(product: any) {
  if (product.role === '核心贡献') return '本场核心成交商品，下场应优先保障库存、排期和讲解时长。';
  if (product.refund_rate > 5) return '退款风险偏高，需要复核质量承诺、售后说明和履约稳定性。';
  if (product.conversion_rate < 2) return '点击后转化偏弱，下场建议减少讲解时长或调整价格权益。';
  return '表现稳定，可作为补充款或利润款继续参与组合。';
}

export async function getLiveSessionReview(idOrLiveId: string) {
  const review = await knex('LiveSessionReview')
    .leftJoin('LiveSession', 'LiveSessionReview.live_id', 'LiveSession.live_id')
    .leftJoin('Anchor', 'LiveSessionReview.anchor_id', 'Anchor.anchor_id')
    .where((builder) => {
      builder.where('LiveSessionReview.review_id', idOrLiveId).orWhere('LiveSessionReview.live_id', idOrLiveId);
    })
    .select('LiveSessionReview.*', 'LiveSession.live_title', 'LiveSession.live_category', 'LiveSession.start_time', 'LiveSession.end_time', 'Anchor.anchor_name')
    .first();
  if (!review) return null;

  const products = await knex('ProductReview')
    .where('review_id', review.review_id)
    .orderBy('gmv', 'desc');

  return normalizeReview(review, products);
}

export async function listLiveSessionReviews(anchorId?: string) {
  let query = knex('LiveSessionReview')
    .leftJoin('LiveSession', 'LiveSessionReview.live_id', 'LiveSession.live_id')
    .leftJoin('Anchor', 'LiveSessionReview.anchor_id', 'Anchor.anchor_id')
    .select('LiveSessionReview.*', 'LiveSession.live_title', 'LiveSession.live_category', 'LiveSession.start_time', 'Anchor.anchor_name');

  if (anchorId) query = query.where('LiveSessionReview.anchor_id', anchorId);

  const reviews = await query.orderBy('LiveSessionReview.generated_time', 'desc');

  return Promise.all(reviews.map(async (review: any) => {
    const products = await knex('ProductReview').where('review_id', review.review_id).orderBy('gmv', 'desc');
    return normalizeReview(review, products);
  }));
}

export async function getReviewProductAnalysis(idOrLiveId: string) {
  const review = await getLiveSessionReview(idOrLiveId);
  if (!review) return null;
  return {
    review_id: review.review_id,
    live_id: review.live_id,
    products: review.products,
    topProducts: review.products.slice(0, 3),
    longTailProducts: review.products.filter((product: any) => product.review_role === '长尾观察'),
  };
}

export async function getReviewAnchorAnalysis(idOrLiveId: string) {
  const review = await getLiveSessionReview(idOrLiveId);
  if (!review) return null;
  return {
    review_id: review.review_id,
    live_id: review.live_id,
    anchor: review.anchor,
    diagnosis: review.diagnosis.filter((item: any) => ['内容结构', '转化'].includes(item.dimension)),
    suggestions: review.suggestions,
  };
}

function normalizeReview(review: any, products: any[]) {
  return {
    review_id: review.review_id,
    live_id: review.live_id,
    live_title: review.live_title,
    live_category: review.live_category,
    anchor_id: review.anchor_id,
    anchor_name: review.anchor_name,
    start_time: review.start_time,
    end_time: review.end_time,
    generated_time: review.generated_time,
    updated_time: review.updated_time,
    score: {
      value: n(review.overall_score),
      grade: review.grade,
    },
    core: {
      plannedGmv: n(review.planned_gmv),
      actualGmv: n(review.actual_gmv),
      gmvAchievement: n(review.gmv_achievement_rate),
      plannedPeakOnline: n(review.planned_peak_online),
      actualPeakOnline: n(review.actual_peak_online),
      trafficAchievement: n(review.traffic_achievement_rate),
      plannedConversionRate: n(review.planned_conversion_rate),
      actualConversionRate: n(review.actual_conversion_rate),
      plannedDurationMinutes: n(review.planned_duration_minutes),
      actualDurationMinutes: n(review.actual_duration_minutes),
    },
    funnel: parseJson(review.funnel_json, {}),
    anchor: parseJson(review.anchor_json, {}),
    diagnosis: parseJson(review.diagnosis_json, []),
    suggestions: parseJson(review.suggestions_json, []),
    summary: review.summary,
    products: products.map((product) => ({
      ...product,
      sales_volume: n(product.sales_volume),
      gmv: n(product.gmv),
      contribution_rate: n(product.contribution_rate),
      click_rate: n(product.click_rate),
      conversion_rate: n(product.conversion_rate),
      refund_rate: n(product.refund_rate),
      interaction_heat: n(product.interaction_heat),
    })),
  };
}
