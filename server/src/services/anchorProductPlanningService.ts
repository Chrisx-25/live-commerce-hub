import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import {
  buildAnchorProductFit,
  buildLivePlanItems,
  type AnchorFitInput,
  type AnchorProductFitResult,
  type ProductFitInput,
} from './anchorProductFitEngine';

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

export function isPlannableLiveStatus(status: string | null | undefined) {
  const value = String(status || '');
  return !value.includes('进行中') && !value.includes('已结束');
}

export function buildPlanConfirmationPatch(now = new Date()) {
  return {
    plan: {
      plan_status: '已确认',
      updated_time: now,
    },
    liveSession: {
      live_status: '已排期',
    },
  };
}

type PlanItemUpdateInput = {
  item_id: string;
  sort_order?: number;
  plan_role?: string;
  suggested_minutes?: number;
  target_gmv?: number;
  target_orders?: number;
  plan_reason?: string;
  risk_notes?: string;
  script_id?: string | null;
};

function intValue(value: any) {
  return Math.max(0, Math.round(n(value)));
}

function textValue(value: any, fallback: string) {
  const text = String(value || '').trim();
  return text || fallback;
}

export function buildPlanItemUpdatePatch(items: PlanItemUpdateInput[]) {
  const normalized = [...items]
    .filter((item) => item.item_id)
    .map((item, index) => ({
      item_id: item.item_id,
      sort_order: intValue(item.sort_order || index + 1),
      plan_role: textValue(item.plan_role, '辅推'),
      suggested_minutes: intValue(item.suggested_minutes),
      target_gmv: n(item.target_gmv),
      target_orders: intValue(item.target_orders),
      plan_reason: textValue(item.plan_reason, '人工调整后的场次安排。'),
      risk_notes: textValue(item.risk_notes, '暂无明显风险。'),
      script_id: item.script_id || null,
    }))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item, index) => ({ ...item, sort_order: index + 1 }));

  return {
    items: normalized,
    summary: {
      target_gmv: normalized.reduce((sum, item) => sum + item.target_gmv, 0),
      target_orders: normalized.reduce((sum, item) => sum + item.target_orders, 0),
      total_planned_minutes: normalized.reduce((sum, item) => sum + item.suggested_minutes, 0),
    },
  };
}

export function buildPlanScriptDraft(input: {
  live_title: string;
  anchor_name: string;
  product_name: string;
  plan_role: string;
  suggested_minutes: number;
  plan_reason: string;
}) {
  const title = `${input.live_title} - ${input.product_name}讲解脚本`;
  const minutes = intValue(input.suggested_minutes) || 3;
  return {
    script_type: '讲解',
    tags: '场次安排AI生成',
    script_title: title,
    script_content: [
      `【场次定位】${input.live_title}`,
      `【主播提示】${input.anchor_name}，本商品在本场定位为${input.plan_role}，建议讲解${minutes}分钟。`,
      `【开场承接】家人们，接下来这款${input.product_name}是本场重点安排的商品，先帮大家把适合谁、值不值得买讲清楚。`,
      `【核心卖点】围绕商品品质、使用场景、价格优势和售后保障展开，重点回应用户为什么现在下单。`,
      `【转化话术】如果你正好有这个需求，先拍下锁定库存和活动价；不确定的家人可以在弹幕里问，我会逐条回答。`,
      `【安排依据】${input.plan_reason}`,
    ].join('\n'),
  };
}

async function getAnchorInput(anchorId: string, category?: string): Promise<AnchorFitInput> {
  const anchor = await knex('Anchor').where('anchor_id', anchorId).first();
  if (!anchor) throw new Error('主播不存在');

  const performance = await knex('AnchorPerformance')
    .where('anchor_id', anchorId)
    .avg('conversion_rate as avg_conversion_rate')
    .avg('interaction_rate as avg_interaction_rate')
    .avg('average_watch_time as avg_watch_time')
    .avg('script_execution_score as avg_script_score')
    .avg('performance_score as avg_performance_score')
    .first();

  const categorySales = await knex('LiveSession')
    .where('anchor_id', anchorId)
    .modify((builder) => {
      if (category) builder.where('live_category', category);
    })
    .sum('total_sales as category_gmv')
    .first();

  return {
    anchor_id: anchor.anchor_id,
    anchor_name: anchor.anchor_name,
    specialization: anchor.specialization,
    anchor_level: anchor.anchor_level,
    fan_count: n(anchor.fan_count),
    avg_conversion_rate: n(performance?.avg_conversion_rate),
    avg_interaction_rate: n(performance?.avg_interaction_rate),
    avg_watch_time: n(performance?.avg_watch_time),
    avg_script_score: n(performance?.avg_script_score),
    avg_performance_score: n(performance?.avg_performance_score),
    category_gmv: n(categorySales?.category_gmv),
  };
}

async function getProductInput(productId: string): Promise<ProductFitInput> {
  const product = await knex('Product').where('product_id', productId).first();
  if (!product) throw new Error('商品不存在');

  const skuStats = await knex('SKU')
    .where('product_id', productId)
    .sum('stock_quantity as stock_quantity')
    .avg('warning_threshold as warning_threshold')
    .first();

  const performance = await knex('ProductPerformance')
    .where('product_id', productId)
    .avg('conversion_rate as avg_conversion_rate')
    .avg('refund_rate as avg_refund_rate')
    .avg('interaction_heat as avg_interaction_heat')
    .sum('gmv as total_gmv')
    .count('* as performance_count')
    .first();

  const performanceCount = n(performance?.performance_count);
  const totalGmv = n(performance?.total_gmv);
  const statusText = String(product.product_status || '');

  return {
    product_id: product.product_id,
    product_name: product.product_name,
    category: product.category,
    gross_profit_rate: n(product.gross_profit_rate),
    sale_price: n(product.sale_price),
    stock_quantity: n(skuStats?.stock_quantity),
    warning_threshold: n(skuStats?.warning_threshold),
    is_cold_start: performanceCount < 2 || totalGmv < 1000 || statusText.includes('待'),
    avg_conversion_rate: n(performance?.avg_conversion_rate),
    avg_refund_rate: n(performance?.avg_refund_rate),
    avg_interaction_heat: n(performance?.avg_interaction_heat),
    total_gmv: totalGmv,
  };
}

async function saveFit(fit: AnchorProductFitResult) {
  const now = new Date();
  const payload = {
    fit_score: fit.fit_score,
    fit_level: fit.fit_level,
    recommended_role: fit.recommended_role,
    scenario_tag: fit.scenario_tag,
    match_reason: fit.match_reason,
    risk_notes: fit.risk_notes,
    score_parts_json: JSON.stringify(fit.score_parts),
    updated_time: now,
  };

  const existing = await knex('AnchorProductFit')
    .where({ anchor_id: fit.anchor_id, product_id: fit.product_id })
    .first();
  if (existing) {
    await knex('AnchorProductFit').where('fit_id', existing.fit_id).update(payload);
    return existing.fit_id;
  }

  const fitId = id('FIT');
  try {
    await knex('AnchorProductFit').insert({
      fit_id: fitId,
      anchor_id: fit.anchor_id,
      product_id: fit.product_id,
      generated_time: now,
      ...payload,
    });
    return fitId;
  } catch (err: any) {
    // Handle race condition: another concurrent call may have inserted the same pair
    const dup = await knex('AnchorProductFit')
      .where({ anchor_id: fit.anchor_id, product_id: fit.product_id })
      .first();
    if (dup) {
      await knex('AnchorProductFit').where('fit_id', dup.fit_id).update(payload);
      return dup.fit_id;
    }
    throw err;
  }
}

function normalizeFit(row: any) {
  return {
    fit_id: row.fit_id,
    anchor_id: row.anchor_id,
    anchor_name: row.anchor_name,
    product_id: row.product_id,
    product_name: row.product_name,
    category: row.category,
    fit_score: n(row.fit_score),
    fit_level: row.fit_level,
    recommended_role: row.recommended_role,
    scenario_tag: row.scenario_tag,
    match_reason: row.match_reason,
    risk_notes: row.risk_notes,
    score_parts: parseJson(row.score_parts_json, {}),
    generated_time: row.generated_time,
    updated_time: row.updated_time,
  };
}

async function buildAndSaveFit(anchorId: string, productId: string) {
  const product = await getProductInput(productId);
  const anchor = await getAnchorInput(anchorId, product.category);
  const fit = buildAnchorProductFit(anchor, product);
  const fitId = await saveFit(fit);
  return { fit_id: fitId, ...fit };
}

export async function generateFitsForProduct(productId: string, limit = 12) {
  const product = await getProductInput(productId);
  const anchors = await knex('Anchor').orderBy('fan_count', 'desc');
  const results = await Promise.allSettled(anchors.map(async (anchor: any) => {
    const anchorInput = await getAnchorInput(anchor.anchor_id, product.category);
    const fit = buildAnchorProductFit(anchorInput, product);
    const fitId = await saveFit(fit);
    return { fit_id: fitId, ...fit };
  }));
  const fits = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);
  return fits.sort((a, b) => b.fit_score - a.fit_score).slice(0, limit);
}

export async function generateFitsForAnchor(anchorId: string, limit = 24) {
  const products = await knex('Product').orderBy('create_time', 'desc');
  const results = await Promise.allSettled(products.map(async (product: any) => buildAndSaveFit(anchorId, product.product_id)));
  const fits = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);
  return fits.sort((a, b) => b.fit_score - a.fit_score).slice(0, limit);
}

export async function listAnchorProductFits(params: {
  anchorId?: string;
  productId?: string;
  category?: string;
  limit?: number;
} = {}) {
  const rows = await knex('AnchorProductFit')
    .join('Anchor', 'AnchorProductFit.anchor_id', 'Anchor.anchor_id')
    .join('Product', 'AnchorProductFit.product_id', 'Product.product_id')
    .modify((builder) => {
      if (params.anchorId) builder.where('AnchorProductFit.anchor_id', params.anchorId);
      if (params.productId) builder.where('AnchorProductFit.product_id', params.productId);
      if (params.category) builder.where('Product.category', params.category);
    })
    .select('AnchorProductFit.*', 'Anchor.anchor_name', 'Product.product_name', 'Product.category')
    .orderBy('AnchorProductFit.fit_score', 'desc')
    .limit(params.limit || 50);

  return rows.map(normalizeFit);
}

async function getFitsForLivePlan(session: any, productIds?: string[]) {
  if (productIds?.length) {
    const fits = await Promise.all(productIds.map((productId) => buildAndSaveFit(session.anchor_id, productId)));
    return fits.sort((a, b) => b.fit_score - a.fit_score);
  }

  let fits = await listAnchorProductFits({
    anchorId: session.anchor_id,
    category: session.live_category,
    limit: 8,
  });

  if (fits.length < 4) {
    await generateFitsForAnchor(session.anchor_id, 80);
    fits = await listAnchorProductFits({
      anchorId: session.anchor_id,
      category: session.live_category,
      limit: 8,
    });
  }

  if (fits.length === 0) {
    fits = await listAnchorProductFits({ anchorId: session.anchor_id, limit: 8 });
  }

  return fits.map((fit: any) => ({
    anchor_id: fit.anchor_id,
    anchor_name: fit.anchor_name,
    product_id: fit.product_id,
    product_name: fit.product_name,
    category: fit.category,
    fit_score: fit.fit_score,
    fit_level: fit.fit_level,
    recommended_role: fit.recommended_role,
    scenario_tag: fit.scenario_tag,
    match_reason: fit.match_reason,
    risk_notes: fit.risk_notes,
    score_parts: fit.score_parts,
  } as AnchorProductFitResult));
}

async function findScriptId(liveId: string, anchorId: string, productId: string) {
  const script = await knex('Script')
    .where('product_id', productId)
    .andWhere((builder) => {
      builder.where('live_id', liveId).orWhere('anchor_id', anchorId).orWhereNull('live_id');
    })
    .orderBy('create_time', 'desc')
    .first();
  return script?.script_id || null;
}

async function ensurePlanItemScript(session: any, item: any) {
  const existing = await knex('Script')
    .where({ live_id: session.live_id, product_id: item.product_id })
    .orderBy('create_time', 'desc')
    .first();
  if (existing) return existing.script_id;

  const product = await knex('Product').where('product_id', item.product_id).first();
  if (!product) return findScriptId(session.live_id, session.anchor_id, item.product_id);

  const draft = buildPlanScriptDraft({
    live_title: session.live_title,
    anchor_name: session.anchor_name,
    product_name: product.product_name,
    plan_role: item.plan_role,
    suggested_minutes: item.suggested_minutes,
    plan_reason: item.plan_reason,
  });
  const scriptId = id('SCR');
  await knex('Script').insert({
    script_id: scriptId,
    product_id: item.product_id,
    live_id: session.live_id,
    anchor_id: session.anchor_id,
    script_title: draft.script_title,
    script_content: draft.script_content,
    script_type: draft.script_type,
    tags: draft.tags,
    recommendation_level: item.fit_level,
    create_time: new Date(),
  });
  return scriptId;
}

export async function createLivePlan(liveId: string, productIds?: string[]) {
  const session = await knex('LiveSession')
    .join('Anchor', 'LiveSession.anchor_id', 'Anchor.anchor_id')
    .where('LiveSession.live_id', liveId)
    .select('LiveSession.*', 'Anchor.anchor_name')
    .first();
  if (!session) throw new Error('直播场次不存在');
  if (!isPlannableLiveStatus(session.live_status)) throw new Error('进行中或已结束场次不能重新生成排品计划');

  const fits = await getFitsForLivePlan(session, productIds);
  const planItems = buildLivePlanItems(fits).slice(0, 8);
  if (planItems.length === 0) throw new Error('当前没有可用于生成计划的商品适配结果');

  const targetGmv = planItems.reduce((sum, item) => sum + item.target_gmv, 0);
  const targetOrders = planItems.reduce((sum, item) => sum + item.target_orders, 0);
  const totalMinutes = planItems.reduce((sum, item) => sum + item.suggested_minutes, 0);
  const now = new Date();
  const existing = await knex('LivePlan').where('live_id', liveId).first();
  const planId = existing?.plan_id || id('PLAN');
  const planGoal = `${session.live_category || '综合'}场次带货计划：优先保障主推款成交，辅推款补充客单，新品以试播验证转化。`;

  if (existing) {
    await knex('LivePlanItem').where('plan_id', existing.plan_id).del();
    await knex('LivePlan').where('plan_id', existing.plan_id).update({
      anchor_id: session.anchor_id,
      plan_status: '草案',
      plan_goal: planGoal,
      target_gmv: targetGmv,
      target_orders: targetOrders,
      total_planned_minutes: totalMinutes,
      updated_time: now,
    });
  } else {
    await knex('LivePlan').insert({
      plan_id: planId,
      live_id: liveId,
      anchor_id: session.anchor_id,
      plan_status: '草案',
      plan_goal: planGoal,
      target_gmv: targetGmv,
      target_orders: targetOrders,
      total_planned_minutes: totalMinutes,
      generated_time: now,
      updated_time: now,
    });
  }

  const itemRows = await Promise.all(planItems.map(async (item) => {
    const row = {
      item_id: id('LPI'),
      plan_id: planId,
      live_id: liveId,
      product_id: item.product_id,
      anchor_id: item.anchor_id,
      sort_order: item.sort_order,
      plan_role: item.plan_role,
      suggested_minutes: item.suggested_minutes,
      target_gmv: item.target_gmv,
      target_orders: item.target_orders,
      fit_score: item.fit_score,
      fit_level: item.fit_level,
      script_id: null as string | null,
      plan_reason: item.plan_reason,
      risk_notes: fits.find((fit: AnchorProductFitResult) => fit.product_id === item.product_id)?.risk_notes || '暂无明显风险。',
    };
    row.script_id = await ensurePlanItemScript(session, row);
    return row;
  }));
  await knex('LivePlanItem').insert(itemRows);

  return getLivePlan(planId);
}

export async function confirmLivePlan(idOrLiveId: string) {
  const existing = await knex('LivePlan')
    .join('LiveSession', 'LivePlan.live_id', 'LiveSession.live_id')
    .where((builder) => {
      builder.where('LivePlan.plan_id', idOrLiveId).orWhere('LivePlan.live_id', idOrLiveId);
    })
    .select('LivePlan.plan_id', 'LivePlan.live_id', 'LiveSession.live_status')
    .first();
  if (!existing) throw new Error('直播计划不存在');
  if (!isPlannableLiveStatus(existing.live_status)) throw new Error('进行中或已结束场次不能确认排品计划');

  const patch = buildPlanConfirmationPatch();
  await knex.transaction(async (trx) => {
    await trx('LivePlan').where('plan_id', existing.plan_id).update(patch.plan);
    await trx('LiveSession').where('live_id', existing.live_id).update(patch.liveSession);
  });

  return getLivePlan(existing.plan_id);
}

export async function updateLivePlan(idOrLiveId: string, payload: {
  plan_goal?: string;
  items?: PlanItemUpdateInput[];
}) {
  const existing = await knex('LivePlan')
    .join('LiveSession', 'LivePlan.live_id', 'LiveSession.live_id')
    .where((builder) => {
      builder.where('LivePlan.plan_id', idOrLiveId).orWhere('LivePlan.live_id', idOrLiveId);
    })
    .select('LivePlan.plan_id', 'LivePlan.live_id', 'LiveSession.live_status')
    .first();
  if (!existing) throw new Error('直播计划不存在');
  if (!isPlannableLiveStatus(existing.live_status)) throw new Error('进行中或已结束场次不能修改带货计划');

  const patch = buildPlanItemUpdatePatch(payload.items || []);
  if (patch.items.length === 0) throw new Error('至少保留一个计划商品');

  await knex.transaction(async (trx) => {
    await trx('LivePlan').where('plan_id', existing.plan_id).update({
      plan_goal: textValue(payload.plan_goal, '人工调整后的场次带货计划。'),
      target_gmv: patch.summary.target_gmv,
      target_orders: patch.summary.target_orders,
      total_planned_minutes: patch.summary.total_planned_minutes,
      updated_time: new Date(),
    });

    await Promise.all(patch.items.map((item) => trx('LivePlanItem')
      .where({ plan_id: existing.plan_id, item_id: item.item_id })
      .update({
        sort_order: item.sort_order,
        plan_role: item.plan_role,
        suggested_minutes: item.suggested_minutes,
        target_gmv: item.target_gmv,
        target_orders: item.target_orders,
        plan_reason: item.plan_reason,
        risk_notes: item.risk_notes,
        script_id: item.script_id,
      })));
  });

  return getLivePlan(existing.plan_id);
}

export async function getLivePlan(idOrLiveId: string) {
  const plan = await knex('LivePlan')
    .join('LiveSession', 'LivePlan.live_id', 'LiveSession.live_id')
    .join('Anchor', 'LivePlan.anchor_id', 'Anchor.anchor_id')
    .where((builder) => {
      builder.where('LivePlan.plan_id', idOrLiveId).orWhere('LivePlan.live_id', idOrLiveId);
    })
    .select('LivePlan.*', 'LiveSession.live_title', 'LiveSession.live_category', 'LiveSession.start_time', 'LiveSession.live_status', 'Anchor.anchor_name')
    .first();
  if (!plan) return null;

  const items = await knex('LivePlanItem')
    .join('Product', 'LivePlanItem.product_id', 'Product.product_id')
    .leftJoin('Script', 'LivePlanItem.script_id', 'Script.script_id')
    .where('LivePlanItem.plan_id', plan.plan_id)
    .select('LivePlanItem.*', 'Product.product_name', 'Product.category', 'Product.sale_price', 'Script.script_title')
    .orderBy('LivePlanItem.sort_order', 'asc');

  return {
    plan_id: plan.plan_id,
    live_id: plan.live_id,
    live_title: plan.live_title,
    live_category: plan.live_category,
    live_status: plan.live_status,
    start_time: plan.start_time,
    anchor_id: plan.anchor_id,
    anchor_name: plan.anchor_name,
    plan_status: plan.plan_status,
    plan_goal: plan.plan_goal,
    target_gmv: n(plan.target_gmv),
    target_orders: n(plan.target_orders),
    total_planned_minutes: n(plan.total_planned_minutes),
    generated_time: plan.generated_time,
    updated_time: plan.updated_time,
    items: items.map((item: any) => ({
      item_id: item.item_id,
      product_id: item.product_id,
      product_name: item.product_name,
      category: item.category,
      sale_price: n(item.sale_price),
      sort_order: n(item.sort_order),
      plan_role: item.plan_role,
      suggested_minutes: n(item.suggested_minutes),
      target_gmv: n(item.target_gmv),
      target_orders: n(item.target_orders),
      fit_score: n(item.fit_score),
      fit_level: item.fit_level,
      script_id: item.script_id,
      script_title: item.script_title,
      plan_reason: item.plan_reason,
      risk_notes: item.risk_notes,
    })),
  };
}
