import { Router, Request, Response } from 'express';
import knex from '../db/knex';
import { authenticate, authorize, getAnchorFilter, ALL_ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(...ALL_ROLES));

/** Apply anchor scope to an Order query by joining LiveSession */
function applyAnchorScope(query: any, anchorId: string | undefined) {
  if (!anchorId) return query;
  return query
    .join('LiveSession', '[Order].live_id', 'LiveSession.live_id')
    .where('LiveSession.anchor_id', anchorId);
}

/** Apply anchor scope to count queries (separate clone to avoid mutating the main query) */
function applyAnchorScopeToCount(baseQuery: any, anchorId: string | undefined) {
  if (!anchorId) return baseQuery;
  return baseQuery
    .join('LiveSession', '[Order].live_id', 'LiveSession.live_id')
    .where('LiveSession.anchor_id', anchorId);
}

function dateOnly(date: Date) {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function changeRate(current: number, previous: number) {
  if (!previous) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

async function getOrderReferenceDate() {
  // Use the latest non-future order date as reference.
  // LiveSimulator creates today-dated orders; scheduled sessions may have future orders.
  const maxDate = await knex('[Order]')
    .max('order_time as max')
    .where('order_time', '<=', knex.fn.now())
    .first();
  return maxDate?.max ? new Date(maxDate.max) : new Date();
}

/**
 * Resolve date range from query params.
 * Priority: startDate+endDate > days (preset)
 * Returns { currentStart, currentEnd, previousStart, previousEnd, actualDays }
 */
async function resolveDateRange(req: Request) {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const days = parseInt(req.query.days as string) || 0;

  let currentStart: Date;
  let currentEnd: Date;

  if (startDate && endDate) {
    // Custom date range
    currentStart = new Date(startDate);
    currentEnd = new Date(endDate);
  } else if (days) {
    // Preset: N days from max order date
    const refDate = await getOrderReferenceDate();
    currentEnd = refDate;
    currentStart = addDays(refDate, -(days - 1));
  } else {
    // Default: 30 days
    const refDate = await getOrderReferenceDate();
    currentEnd = refDate;
    currentStart = addDays(refDate, -29);
  }

  // Normalize to start-of-day for currentStart and end-of-day for currentEnd
  currentStart.setHours(0, 0, 0, 0);
  currentEnd.setHours(23, 59, 59, 999);

  // Previous period: same length
  const actualMs = currentEnd.getTime() - currentStart.getTime();
  const actualDays = Math.max(1, Math.round(actualMs / (1000 * 60 * 60 * 24)) + 1);
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - actualMs);

  return {
    currentStart,
    currentEnd: new Date(currentEnd.getTime() + 1), // +1ms for < comparison
    previousStart,
    previousEnd: new Date(previousEnd.getTime() + 1),
    actualDays,
    label: startDate && endDate
      ? `自定义`
      : `近${actualDays}天`,
    compareLabel: startDate && endDate
      ? `较前${actualDays}天`
      : `较前${actualDays}天`,
  };
}

// GET /api/dashboard/summary?days=30  OR  ?startDate=2026-05-01&endDate=2026-06-01
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const range = await resolveDateRange(req);
    const scope = getAnchorFilter(req);

    const currentOrders = await applyAnchorScope(
      knex('[Order]')
        .where('order_time', '>=', range.currentStart)
        .where('order_time', '<', range.currentEnd),
      scope.anchor_id
    ).sum('order_amount as total').count('* as count').first();
    const previousOrders = await applyAnchorScope(
      knex('[Order]')
        .where('order_time', '>=', range.previousStart)
        .where('order_time', '<', range.previousEnd),
      scope.anchor_id
    ).sum('order_amount as total').count('* as count').first();

    // AnchorPerformance may have a different time span than Orders.
    // Try period-specific query first; fall back to all-time if empty.
    let avgConv = await knex('AnchorPerformance')
      .where('evaluation_time', '>=', range.currentStart)
      .where('evaluation_time', '<', range.currentEnd)
      .avg('conversion_rate as avg')
      .first();
    if (!avgConv?.avg) {
      avgConv = await knex('AnchorPerformance').avg('conversion_rate as avg').first();
    }
    let previousAvgConv = await knex('AnchorPerformance')
      .where('evaluation_time', '>=', range.previousStart)
      .where('evaluation_time', '<', range.previousEnd)
      .avg('conversion_rate as avg')
      .first();
    if (!previousAvgConv?.avg) {
      previousAvgConv = await knex('AnchorPerformance').avg('conversion_rate as avg').first();
    }

    // Product may use '在售' or '上架' depending on data snapshot
    let totalProducts = await knex('Product').where('product_status', '在售').count('* as count').first();
    if (!Number(totalProducts?.count)) {
      totalProducts = await knex('Product').where('product_status', '上架').count('* as count').first();
    }
    // Fallback: count all non-新品 products
    if (!Number(totalProducts?.count)) {
      totalProducts = await knex('Product').whereNot('product_status', '新品').count('* as count').first();
    }

    // Stock alerts: for anchors, count alerts for products in their own sessions
    let stockAlerts: any;
    if (scope.anchor_id) {
      stockAlerts = await knex('Inventory')
        .join('SKU', 'Inventory.sku_id', 'SKU.sku_id')
        .join('ProductPerformance', 'SKU.product_id', 'ProductPerformance.product_id')
        .join('LiveSession', 'ProductPerformance.live_id', 'LiveSession.live_id')
        .where('LiveSession.anchor_id', scope.anchor_id)
        .where('Inventory.current_stock', '<=', knex.raw('Inventory.safety_stock'))
        .countDistinct('Inventory.inventory_id as count')
        .first();
    } else {
      stockAlerts = await knex('Inventory').where('current_stock', '<=', knex.raw('safety_stock')).count('* as count').first();
    }

    const totalGmv = Number(currentOrders?.total) || 0;
    const totalOrders = Number(currentOrders?.count) || 0;
    const avgConversionRate = Number(avgConv?.avg) || 0;

    // Anchor scope info
    let scopeInfo: { type: 'anchor'; anchorName: string; anchorId: string } | { type: 'global' } = { type: 'global' };
    if (scope.anchor_id) {
      const anchor = await knex('Anchor').where('anchor_id', scope.anchor_id).first();
      scopeInfo = {
        type: 'anchor',
        anchorName: anchor?.anchor_name || '',
        anchorId: scope.anchor_id,
      };
    }

    return res.json({
      totalGmv,
      totalOrders,
      avgConversionRate,
      totalProducts: Number(totalProducts?.count) || 0,
      stockAlertCount: Number(stockAlerts?.count) || 0,
      dailyAvgGmv: Number((totalGmv / range.actualDays).toFixed(2)),
      dailyAvgOrders: Number((totalOrders / range.actualDays).toFixed(1)),
      gmvChange: changeRate(totalGmv, Number(previousOrders?.total) || 0),
      ordersChange: changeRate(totalOrders, Number(previousOrders?.count) || 0),
      conversionChange: changeRate(avgConversionRate, Number(previousAvgConv?.avg) || 0),
      scope: scopeInfo,
      period: {
        label: range.label,
        startDate: dateOnly(range.currentStart),
        endDate: dateOnly(new Date(range.currentEnd.getTime() - 1)),
        compareLabel: range.compareLabel,
        stockSnapshotLabel: '库存为当前快照',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/trend?days=30  OR  ?startDate=...&endDate=...
router.get('/trend', async (req: Request, res: Response) => {
  try {
    const range = await resolveDateRange(req);
    const scope = getAnchorFilter(req);

    const data = await applyAnchorScope(
      knex('[Order]')
        .select(knex.raw('CAST([Order].order_time AS DATE) as date'))
        .sum('[Order].order_amount as gmv')
        .count('* as orders')
        .where('[Order].order_time', '>=', range.currentStart)
        .where('[Order].order_time', '<', range.currentEnd)
        .groupBy(knex.raw('CAST([Order].order_time AS DATE)')),
      scope.anchor_id
    ).orderBy('date', 'asc');

    // Zero-fill missing dates so the chart renders a continuous line
    // Use local date formatting to avoid timezone boundary mismatches
    const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dataMap = new Map<string, { gmv: number; orders: number }>();
    for (const row of data) {
      const d = row.date instanceof Date ? fmtDate(new Date(row.date)) : String(row.date).split('T')[0];
      dataMap.set(d, { gmv: Number(row.gmv) || 0, orders: Number(row.orders) || 0 });
    }

    const filled: { date: string; gmv: number; orders: number }[] = [];
    // Normalize to local midnight to avoid UTC day boundary
    const cursor = new Date(range.currentStart.getFullYear(), range.currentStart.getMonth(), range.currentStart.getDate());
    const endDay = new Date(range.currentEnd.getFullYear(), range.currentEnd.getMonth(), range.currentEnd.getDate());
    endDay.setDate(endDay.getDate() - 1); // currentEnd is exclusive (+1ms), step back to last actual day
    while (cursor <= endDay) {
      const key = fmtDate(cursor);
      const entry = dataMap.get(key);
      filled.push({ date: key, gmv: entry?.gmv || 0, orders: entry?.orders || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return res.json(filled);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/top-anchors?limit=5&days=30  OR  ?startDate=...&endDate=...
// Note: intentionally NOT anchor-scoped — this is a company-wide ranking for comparison
router.get('/top-anchors', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const range = await resolveDateRange(req);

    const data = await knex('Anchor')
      .join('LiveSession', 'Anchor.anchor_id', 'LiveSession.anchor_id')
      .join('[Order]', 'LiveSession.live_id', '[Order].live_id')
      .select(
        'Anchor.anchor_id',
        'Anchor.anchor_name',
        'Anchor.specialization',
        'Anchor.anchor_level',
        'Anchor.fan_count'
      )
      .sum('[Order].order_amount as total_gmv')
      .where('[Order].order_time', '>=', range.currentStart)
      .where('[Order].order_time', '<', range.currentEnd)
      .groupBy('Anchor.anchor_id', 'Anchor.anchor_name', 'Anchor.specialization', 'Anchor.anchor_level', 'Anchor.fan_count')
      .orderBy('total_gmv', 'desc')
      .limit(limit);

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/category-gmv?days=30  OR  ?startDate=...&endDate=...
router.get('/category-gmv', async (req: Request, res: Response) => {
  try {
    const range = await resolveDateRange(req);
    const scope = getAnchorFilter(req);

    const base = knex('[Order]')
      .join('SKU', '[Order].sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id');
    const data = await applyAnchorScope(
      base.select('Product.category')
        .sum('[Order].order_amount as gmv')
        .count('* as order_count')
        .where('[Order].order_time', '>=', range.currentStart)
        .where('[Order].order_time', '<', range.currentEnd)
        .groupBy('Product.category'),
      scope.anchor_id
    ).orderBy('gmv', 'desc');

    return res.json(data.map((r: any) => ({
      category: r.category,
      gmv: Number(r.gmv) || 0,
      orderCount: Number(r.order_count) || 0,
    })));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/top-products?limit=10&days=30  OR  ?startDate=...&endDate=...
router.get('/top-products', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const range = await resolveDateRange(req);
    const scope = getAnchorFilter(req);

    const base = knex('[Order]')
      .join('SKU', '[Order].sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id');
    const data = await applyAnchorScope(
      base.select(
        'Product.product_id',
        'Product.product_name',
        'Product.category',
        'Product.sale_price'
      )
        .sum('[Order].order_amount as gmv')
        .sum('[Order].order_quantity as quantity')
        .where('[Order].order_time', '>=', range.currentStart)
        .where('[Order].order_time', '<', range.currentEnd)
        .groupBy('Product.product_id', 'Product.product_name', 'Product.category', 'Product.sale_price'),
      scope.anchor_id
    ).orderBy('gmv', 'desc').limit(limit);

    return res.json(data.map((r: any) => ({
      productId: r.product_id,
      productName: r.product_name,
      category: r.category,
      salePrice: Number(r.sale_price) || 0,
      gmv: Number(r.gmv) || 0,
      quantity: Number(r.quantity) || 0,
    })));
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
