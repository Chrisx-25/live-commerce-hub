import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { getChatsForCategory, genericChats } from '../chat-templates';
import { analyzeChatBatch, generateInsight, recommendScript } from './llmService';

interface ProductSKU {
  product_id: string;
  product_name: string;
  sale_price: number;
  sku_id: string;
  sku_name: string;
}

export interface SimulatorSnapshotState {
  online: number;
  totalOrders: number;
  gmv: number;
  peakOnline: number;
  duration: number;
  currentProduct: { product_name: string; price: number } | null;
  recentOrders: any[];
  recentChats: any[];
  sentiment: { positive: number; neutral: number; negative: number };
  onlineHistory: number[];
  gmvHistory: number[];
  timeLabels: string[];
  insight?: any | null;
  scriptRecommendation?: any | null;
}

interface SimulatorState {
  liveId: string;
  running: boolean;
  interval: NodeJS.Timeout | null;
  online: number;
  baseOnline: number;
  totalOrders: number;
  gmv: number;
  peakOnline: number;
  startTime: Date;
  pendingChats: { id: string; content: string }[];
  lastAnalysisTime: number;
  lastInsightTime: number;
  sentimentCounts: { positive: number; neutral: number; negative: number };
  category: string;
  productSkus: ProductSKU[];  // Pre-loaded SKUs for this session's category
  currentProduct: ProductSKU | undefined;
  productIndex: number;
  productSwitchTime: number;
  recentChats: string[];
  recentChatEvents: any[];
  recentOrderEvents: any[];
  onlineHistory: number[];
  gmvHistory: number[];
  timeLabels: string[];
  lastSentimentStats: { positive: number; neutral: number; negative: number };
  lastInsight: any | null;
  lastScriptRecommendation: any | null;
  lastDbSyncTime: number;
}

const sessions: Map<string, SimulatorState> = new Map();
const sseClients: Map<string, Set<any>> = new Map();

export function getSimulator(liveId: string) {
  return sessions.get(liveId);
}

export function addSSEClient(liveId: string, res: any) {
  if (!sseClients.has(liveId)) sseClients.set(liveId, new Set());
  sseClients.get(liveId)!.add(res);
  const state = sessions.get(liveId);
  if (state) sendEvent(res, 'snapshot', getSnapshot(state));
}

export function removeSSEClient(liveId: string, res: any) {
  sseClients.get(liveId)?.delete(res);
}

export function stopAllSimulations() {
  for (const state of sessions.values()) {
    state.running = false;
    if (state.interval) clearInterval(state.interval);
  }
  sessions.clear();
  for (const clients of sseClients.values()) {
    for (const res of clients) {
      try { res.end(); } catch { /* client already closed */ }
    }
  }
  sseClients.clear();
}

function sendEvent(res: any, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  res.write(payload);
}

function broadcast(liveId: string, event: string, data: any) {
  const clients = sseClients.get(liveId);
  if (!clients) return;
  for (const res of clients) {
    try { sendEvent(res, event, data); } catch { /* client disconnected */ }
  }
}

function remember<T>(items: T[], item: T, max: number) {
  items.unshift(item);
  if (items.length > max) items.pop();
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function pushSeriesPoint(state: SimulatorState) {
  const duration = Math.floor((Date.now() - state.startTime.getTime()) / 1000);
  state.timeLabels.push(formatMMSS(duration));
  state.onlineHistory.push(state.online);
  state.gmvHistory.push(Math.round(state.gmv * 100) / 100);
  // Keep last 500 points — covers ~83 min at 10s intervals,
  // so clients connecting mid-session get full-history snapshots.
  if (state.timeLabels.length > 500) state.timeLabels.shift();
  if (state.onlineHistory.length > 500) state.onlineHistory.shift();
  if (state.gmvHistory.length > 500) state.gmvHistory.shift();
}

export function createWarmupSeries(nowMs: number, seconds: number, baseOnline: number, gmv: number) {
  const labels: string[] = [];
  const online: number[] = [];
  const gmvValues: number[] = [];
  const points = 30;
  for (let index = points - 1; index >= 0; index--) {
    // Spread labels evenly across the preload duration (in seconds)
    const elapsedSec = Math.round(seconds * (1 - (index / (points - 1))));
    labels.push(formatMMSS(elapsedSec));
    online.push(Math.max(50, Math.round(baseOnline + Math.sin(index + baseOnline) * 120 - index * 18)));
    gmvValues.push(Math.max(0, Math.round((gmv * (points - index)) / points)));
  }
  return { labels, online, gmv: gmvValues };
}

export function resolveSimulationStartTime(options: {
  nowMs?: number;
  preloadSeconds?: number;
  preserveStartTime?: boolean;
  sessionStartTime?: string | Date | null;
}) {
  const nowMs = options.nowMs ?? Date.now();
  if (options.preserveStartTime && options.sessionStartTime) {
    const sessionStart = new Date(options.sessionStartTime);
    if (Number.isFinite(sessionStart.getTime())) return sessionStart;
  }
  return new Date(nowMs - Math.max(0, options.preloadSeconds || 0) * 1000);
}

export function buildSimulatorSnapshot(state: SimulatorSnapshotState) {
  return {
    metrics: {
      online: state.online,
      totalOrders: state.totalOrders,
      gmv: Math.round(state.gmv * 100) / 100,
      peakOnline: state.peakOnline,
      duration: state.duration,
    },
    orders: state.recentOrders,
    chats: state.recentChats,
    sentiment: state.sentiment,
    currentProduct: state.currentProduct,
    series: {
      labels: state.timeLabels,
      online: state.onlineHistory,
      gmv: state.gmvHistory,
    },
    insight: state.insight || null,
    scriptRecommendation: state.scriptRecommendation || null,
  };
}

function getSnapshot(state: SimulatorState) {
  const total = state.sentimentCounts.positive + state.sentimentCounts.neutral + state.sentimentCounts.negative;
  const duration = Math.floor((Date.now() - state.startTime.getTime()) / 1000);
  return buildSimulatorSnapshot({
    online: state.online,
    totalOrders: state.totalOrders,
    gmv: state.gmv,
    peakOnline: state.peakOnline || state.online,
    duration,
    currentProduct: state.currentProduct
      ? { product_name: state.currentProduct.product_name, price: state.currentProduct.sale_price }
      : null,
    recentOrders: state.recentOrderEvents,
    recentChats: state.recentChatEvents,
    sentiment: total > 0 ? state.lastSentimentStats : { positive: 1, neutral: 1, negative: 1 },
    onlineHistory: state.onlineHistory,
    gmvHistory: state.gmvHistory,
    timeLabels: state.timeLabels,
    insight: state.lastInsight,
    scriptRecommendation: state.lastScriptRecommendation,
  });
}

async function loadSessionSKUs(liveId: string, category: string): Promise<ProductSKU[]> {
  const rows = await knex('SKU')
    .join('Product', 'SKU.product_id', 'Product.product_id')
    .select(
      'SKU.sku_id',
      'SKU.sku_name',
      'Product.product_id',
      'Product.product_name',
      'Product.sale_price'
    )
    .where('Product.category', category || '\u5973\u88c5')
    .where('Product.product_status', '\u5728\u552e')
    .where('SKU.sku_status', '\u5728\u552e')
    .limit(100);

  if (rows.length === 0) {
    // Fallback: any products
    const fallback = await knex('SKU')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .select(
        'SKU.sku_id',
        'SKU.sku_name',
        'Product.product_id',
        'Product.product_name',
        'Product.sale_price'
      )
      .where('Product.product_status', '\u5728\u552e')
      .where('SKU.sku_status', '\u5728\u552e')
      .limit(100);
    return fallback;
  }
  return rows;
}

export async function startSimulation(liveId: string, options: { preloadSeconds?: number; preserveStartTime?: boolean } = {}) {
  if (sessions.has(liveId)) return;

  const session = await knex('LiveSession').where('live_id', liveId).first();
  if (!session) throw new Error('Session not found');

  const category = session.live_category || '\u5973\u88c5';
  const productSkus = await loadSessionSKUs(liveId, category);
  const firstProduct = productSkus[Math.floor(Math.random() * productSkus.length)];
  const preloadSeconds = options.preloadSeconds ?? 0;
  const hasPreload = preloadSeconds > 0;
  const startedAt = resolveSimulationStartTime({
    preloadSeconds,
    preserveStartTime: options.preserveStartTime,
    sessionStartTime: session.start_time,
  });
  // Fresh starts begin with realistic low viewership; resumed sessions
  // carry their natural base via preload data (buildWarmupChats/Orders).
  const baseOnline = hasPreload ? 500 + Math.floor(Math.random() * 2000) : Math.floor(Math.random() * 55);
  const online = Math.max(5, baseOnline + Math.floor(Math.random() * (hasPreload ? 400 : 30)));

  // Warmup data only makes sense when resuming a session that has been running.
  // For fresh starts (preloadSeconds=0), begin with empty history so the chart
  // shows a single point and builds naturally over time.
  const warmupGmv = hasPreload ? Math.round((firstProduct?.sale_price || 99) * (2 + Math.floor(Math.random() * 8))) : 0;
  const warmupSeries = hasPreload
    ? createWarmupSeries(Date.now(), preloadSeconds, online, warmupGmv)
    : { labels: [] as string[], online: [] as number[], gmv: [] as number[] };
  const warmChats = hasPreload ? buildWarmupChats(category, firstProduct) : [];
  const warmOrders = hasPreload ? buildWarmupOrders(firstProduct, warmupGmv) : [];

  const state: SimulatorState = {
    liveId,
    running: true,
    interval: null,
    online,
    baseOnline,
    totalOrders: warmOrders.length,
    gmv: warmOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    peakOnline: hasPreload ? Math.max(...warmupSeries.online, online) : online,
    startTime: startedAt,
    pendingChats: [],
    lastAnalysisTime: Date.now(),
    lastInsightTime: Date.now(),
    lastDbSyncTime: Date.now(),
    sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
    category,
    productSkus,
    currentProduct: firstProduct,
    productIndex: 0,
    productSwitchTime: Date.now() + 30000 + Math.random() * 60000,
    recentChats: warmChats.map((chat) => chat.content),
    recentChatEvents: warmChats,
    recentOrderEvents: warmOrders,
    onlineHistory: warmupSeries.online,
    gmvHistory: warmupSeries.gmv,
    timeLabels: warmupSeries.labels,
    lastSentimentStats: { positive: 55, neutral: 35, negative: 10 },
    lastInsight: null,
    lastScriptRecommendation: null,
  };

  const update: any = { live_status: '\u8fdb\u884c\u4e2d' };
  if (!options.preserveStartTime) {
    update.start_time = startedAt;
    // Fresh start: reset counters so the LiveSessionsPage doesn't
    // show stale peak / sales from a previous simulation run.
    update.online_peak = online;
    update.total_sales = 0;
  }
  await knex('LiveSession').where('live_id', liveId).update(update);

  sessions.set(liveId, state);

  // Push the very first data point immediately so the chart shows data right away
  pushSeriesPoint(state);
  broadcast(liveId, 'metrics', {
    online: state.online,
    totalOrders: state.totalOrders,
    gmv: Math.round(state.gmv * 100) / 100,
    peakOnline: state.peakOnline,
    duration: 0,
  });

  // Send initial current product
  broadcast(liveId, 'current_product', {
    product_name: firstProduct?.product_name || '\u70ed\u5356\u5546\u54c1',
    price: firstProduct?.sale_price || 99,
  });

  state.interval = setInterval(() => tick(state), 2000 + Math.random() * 3000);
}

function buildWarmupChats(category: string, product?: ProductSKU) {
  const templates = [...getChatsForCategory(category), ...genericChats];
  const count = 12;
  return Array.from({ length: count }, (_, index) => {
    let content = templates[index % templates.length] || '\u5e93\u5b58\u8fd8\u6709\u5417';
    if (product && index % 4 === 0) content = content.replace(/\u8fd9\u4e2a|\u4ea7\u54c1/g, product.product_name.substring(0, 6));
    return {
      id: uuid().replace(/-/g, '').substring(0, 16),
      userId: '',
      nickname: `\u89c2\u4f17${String(index + 1).padStart(2, '0')}`,
      content,
      type: '\u5f39\u5e55',
      sentiment: null,
      time: new Date(Date.now() - (count - index) * 5000).toISOString(),
    };
  });
}

function buildWarmupOrders(product?: ProductSKU, gmv = 0) {
  if (!product) return [];
  const count = Math.max(2, Math.min(8, Math.round(gmv / (Number(product.sale_price) || 99))));
  return Array.from({ length: count }, (_, index) => ({
    orderId: uuid().replace(/-/g, '').substring(0, 16),
    userId: '',
    nickname: `\u7528\u6237${String(index + 1).padStart(2, '0')}`,
    productName: product.product_name?.substring(0, 10),
    skuName: product.sku_name?.substring(0, 10),
    amount: Number(product.sale_price) || 99,
    time: new Date(Date.now() - (count - index) * 9000).toISOString(),
  }));
}

export async function startActiveSimulations() {
  const activeSessions = await knex('LiveSession')
    .select('live_id')
    .where('live_status', '\u8fdb\u884c\u4e2d')
    .limit(20);
  for (const session of activeSessions) {
    try {
      await startSimulation(session.live_id, { preloadSeconds: 180, preserveStartTime: true });
    } catch (error) {
      console.error(`[LiveCommerceHub] Failed to preload live simulation ${session.live_id}`, error);
    }
  }
  if (activeSessions.length > 0) {
    console.log(`[LiveCommerceHub] Preloaded ${activeSessions.length} active live simulation(s)`);
  }
}

export async function stopSimulation(liveId: string) {
  const state = sessions.get(liveId);
  if (!state) return;

  state.running = false;
  if (state.interval) clearInterval(state.interval);
  sessions.delete(liveId);

  const orderStats = await knex('[Order]')
    .where('live_id', liveId)
    .sum('order_amount as total')
    .count('* as count')
    .first();

  await knex('LiveSession').where('live_id', liveId).update({
    live_status: '\u5df2\u7ed3\u675f',
    end_time: new Date(),
    online_peak: state.peakOnline || state.online,
    total_sales: orderStats?.total || state.gmv,
  });
}

async function tick(state: SimulatorState) {
  if (!state.running) return;

  // 1. Product rotation (every 30-90 seconds)
  const now = Date.now();
  if (now > state.productSwitchTime && state.productSkus.length > 1) {
    state.productIndex = (state.productIndex + 1) % state.productSkus.length;
    state.currentProduct = state.productSkus[state.productIndex];
    state.productSwitchTime = now + 30000 + Math.random() * 60000;

    broadcast(state.liveId, 'current_product', {
      product_name: state.currentProduct.product_name,
      price: state.currentProduct.sale_price,
    });
  }

  // 2. Online number walk
  const walk = Math.floor((Math.random() - 0.45) * 200);
  state.online = Math.max(50, state.online + walk);
  if (state.online > state.peakOnline) state.peakOnline = state.online;

  // 3. Generate orders — pick from session's actual SKUs
  const orderProb = 0.0008 * state.online;
  if (Math.random() < orderProb) {
    const user = await knex('User').orderByRaw('NEWID()').first();
    // Pick a random SKU from our session's product list
    const sku = state.productSkus[Math.floor(Math.random() * state.productSkus.length)];
    if (user && sku) {
      const orderId = uuid().replace(/-/g, '').substring(0, 16);
      const salePrice = parseFloat(String(sku.sale_price)) || 99;
      const discount = Math.random() > 0.7 ? Math.floor(Math.random() * Math.min(30, salePrice * 0.15)) : 0;
      const amount = salePrice - discount;

      await knex('[Order]').insert({
        order_id: orderId,
        user_id: user.user_id,
        live_id: state.liveId,
        sku_id: sku.sku_id,
        original_price: salePrice,
        discount_amount: discount,
        order_quantity: 1,
        order_amount: amount > 0 ? amount : salePrice,
        payment_status: '\u5df2\u652f\u4ed8',
        order_status: '\u5df2\u5b8c\u6210',
        order_time: new Date(),
      });
      state.totalOrders++;
      state.gmv += amount > 0 ? amount : salePrice;

      await knex('SKU').where('sku_id', sku.sku_id).decrement('stock_quantity', 1);
      await knex('SKU').where('sku_id', sku.sku_id).increment('sales_volume', 1);

      const orderEvent = {
        orderId,
        userId: user.user_id,
        nickname: user.nickname,
        productName: sku.product_name?.substring(0, 10),
        skuName: sku.sku_name?.substring(0, 10),
        amount: amount > 0 ? amount : salePrice,
        time: new Date().toISOString(),
      };
      remember(state.recentOrderEvents, orderEvent, 50);
      broadcast(state.liveId, 'order', orderEvent);
    }
  }

  // 4. Generate chats — include current product name for context
  const chatCount = Math.floor(Math.random() * 5) + 1;
  for (let i = 0; i < chatCount; i++) {
    const categoryChats = getChatsForCategory(state.category);
    const allChats = [...categoryChats, ...genericChats];
    let content = allChats[Math.floor(Math.random() * allChats.length)];

    // Inject product name occasionally
    if (Math.random() < 0.15 && state.currentProduct) {
      content = content.replace(/\u8fd9\u4e2a|\u4ea7\u54c1/g, state.currentProduct.product_name?.substring(0, 6) || '\u8fd9\u4e2a');
    }

    const chatId = uuid().replace(/-/g, '').substring(0, 16);
    const user = await knex('User').orderByRaw('NEWID()').first();

    await knex('InteractionLog').insert({
      interaction_id: chatId,
      live_id: state.liveId,
      user_id: user?.user_id || null,
      interaction_type: '\u5f39\u5e55',
      interaction_content: content,
      interaction_time: new Date(),
      analysis_status: '\u5f85\u5206\u6790',
    });

    state.pendingChats.push({ id: chatId, content });
    state.recentChats.push(content);
    if (state.recentChats.length > 20) state.recentChats.shift();

    const chatEvent = {
      id: chatId,
      userId: user?.user_id || '',
      nickname: user?.nickname || '\u533f\u540d\u7528\u6237',
      content,
      type: '\u5f39\u5e55',
      sentiment: null,
      time: new Date().toISOString(),
    };
    remember(state.recentChatEvents, chatEvent, 100);
    broadcast(state.liveId, 'chat', chatEvent);
  }

  // 5. Trigger LLM analysis
  if (state.pendingChats.length >= 20 || (state.pendingChats.length > 0 && now - state.lastAnalysisTime > 15000)) {
    const batch = state.pendingChats.splice(0, state.pendingChats.length);
    const results = await analyzeChatBatch(batch);

    for (const r of results) {
      if (r.sentiment === '\u6b63\u9762') state.sentimentCounts.positive++;
      else if (r.sentiment === '\u8d1f\u9762') state.sentimentCounts.negative++;
      else state.sentimentCounts.neutral++;

      await knex('InteractionLog').where('interaction_id', r.id).update({
        sentiment_label: r.sentiment,
        semantic_label: r.semantic_label,
        purchase_intention: r.purchase_intention,
        confidence_score: r.confidence,
        analysis_status: '\u5df2\u5206\u6790',
      });
    }

    const total = state.sentimentCounts.positive + state.sentimentCounts.neutral + state.sentimentCounts.negative || 1;
    const sentimentStats = {
      positive: Math.round((state.sentimentCounts.positive / total) * 100),
      neutral: Math.round((state.sentimentCounts.neutral / total) * 100),
      negative: Math.round((state.sentimentCounts.negative / total) * 100),
    };

    state.lastAnalysisTime = now;
    state.lastSentimentStats = sentimentStats;
    broadcast(state.liveId, 'sentiment', sentimentStats);

    // Check signal triggers \u2014 based on LLM/mock analysis results (semantic labels)
    const labelCounts: Record<string, number> = {};
    for (const r of results) {
      const label = r.semantic_label || '\u5176\u4ed6';
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    }
    const totalResults = results.length || 1;
    const recentText = state.recentChats.join('; ');

    // Priority-ordered signal detection:
    // 1. Price questioning (highest urgency \u2014 lose the sale if not handled)
    // 2. Negative sentiment surge (>35% or many\u552e\u540e\u62b1\u6028)
    // 3. Purchase intent spike (capitalize on buying mood)
    // 4. Product inquiry (answer to convert)
    // 5. Cold period (re-engage audience)
    let signal: string | null = null;
    let reason = '';

    if ((labelCounts['\u4ef7\u683c\u8d28\u7591'] || 0) >= 2) {
      signal = '\u4ef7\u683c\u8d28\u7591';
      reason = `${labelCounts['\u4ef7\u683c\u8d28\u7591']}\u6761\u4ef7\u683c\u8d28\u7591\u5f39\u5e55\u9700\u56de\u5e94`;
    } else if (sentimentStats.negative > 35 || (labelCounts['\u552e\u540e\u62b1\u6028'] || 0) >= 3) {
      signal = '\u8d1f\u9762\u60c5\u7eea';
      reason = sentimentStats.negative > 35 ? '\u8d1f\u9762\u60c5\u7eea\u5360\u6bd4\u8d85\u8fc735%' : '\u552e\u540e\u62b1\u6028\u589e\u591a';
    } else if ((labelCounts['\u8d2d\u4e70\u610f\u5411'] || 0) >= 2) {
      signal = '\u8d2d\u4e70\u610f\u5411';
      reason = `${labelCounts['\u8d2d\u4e70\u610f\u5411']}\u6761\u8d2d\u4e70\u610f\u5411\u53ef\u4fc3\u5355`;
    } else if ((labelCounts['\u54a8\u8be2'] || 0) >= 3) {
      signal = '\u4ea7\u54c1\u54a8\u8be2';
      reason = `${labelCounts['\u54a8\u8be2']}\u6761\u54a8\u8be2\u9700\u7edf\u4e00\u56de\u590d`;
    } else if (totalResults <= 3 && sentimentStats.neutral >= 70) {
      signal = '\u51b7\u573a';
      reason = '\u5f39\u5e55\u91cf\u4f4e\u8ff7\uff0c\u9700\u6fc0\u6d3b\u6c1b\u56f4';
    }

    if (signal) {
      const productName = state.currentProduct?.product_name || '\u70ed\u5356\u5546\u54c1';
      const price = state.currentProduct?.sale_price || 99;
      const script = await recommendScript(signal, productName, price, recentText, sentimentStats);
      if (script) {
        state.lastScriptRecommendation = { trigger: signal, scriptSnippet: script, reason };
        broadcast(state.liveId, 'script_recommendation', state.lastScriptRecommendation);
      }
    }
  }

  // 6. Generate insights every ~2 minutes
  if (now - state.lastInsightTime > 120000) {
    const total = state.sentimentCounts.positive + state.sentimentCounts.neutral + state.sentimentCounts.negative || 1;
    const summary = state.recentChats.slice(-10).join('; ');
    const insight = await generateInsight(summary, {
      positive: Math.round((state.sentimentCounts.positive / total) * 100),
      neutral: Math.round((state.sentimentCounts.neutral / total) * 100),
      negative: Math.round((state.sentimentCounts.negative / total) * 100),
    });
    state.lastInsightTime = now;
    state.lastInsight = { ...insight, timestamp: new Date().toISOString() };
    broadcast(state.liveId, 'llm_insight', state.lastInsight);
  }

  // 7. Push metrics
  pushSeriesPoint(state);
  broadcast(state.liveId, 'metrics', {
    online: state.online,
    totalOrders: state.totalOrders,
    gmv: Math.round(state.gmv * 100) / 100,
    peakOnline: state.peakOnline,
    duration: Math.floor((now - state.startTime.getTime()) / 1000),
  });

  // 8. Periodic DB sync — persist online_peak and total_sales so the
  //    LiveSessionsPage shows live data, not just stale pre-simulation values.
  if (now - state.lastDbSyncTime > 30_000) {
    state.lastDbSyncTime = now;
    try {
      await knex('LiveSession').where('live_id', state.liveId).update({
        online_peak: state.peakOnline,
        total_sales: Math.round(state.gmv * 100) / 100,
      });
    } catch (_err) {
      // Non-critical — next sync will retry.
    }
  }
}
