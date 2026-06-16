import { Router, Request, Response } from 'express';
import knex from '../db/knex';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

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
  const maxDate = await knex('[Order]').max('order_time as max').first();
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

    const currentOrders = await knex('[Order]')
      .where('order_time', '>=', range.currentStart)
      .where('order_time', '<', range.currentEnd)
      .sum('order_amount as total')
      .count('* as count')
      .first();
    const previousOrders = await knex('[Order]')
      .where('order_time', '>=', range.previousStart)
      .where('order_time', '<', range.previousEnd)
      .sum('order_amount as total')
      .count('* as count')
      .first();

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

    const stockAlerts = await knex('Inventory').where('current_stock', '<=', knex.raw('safety_stock')).count('* as count').first();

    const totalGmv = Number(currentOrders?.total) || 0;
    const totalOrders = Number(currentOrders?.count) || 0;
    const avgConversionRate = Number(avgConv?.avg) || 0;

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

    const data = await knex('[Order]')
      .select(knex.raw('CAST(order_time AS DATE) as date'))
      .sum('order_amount as gmv')
      .count('* as orders')
      .where('order_time', '>=', range.currentStart)
      .where('order_time', '<', range.currentEnd)
      .groupBy(knex.raw('CAST(order_time AS DATE)'))
      .orderBy('date', 'asc');

    // Zero-fill missing dates so the chart renders a continuous line
    const dataMap = new Map<string, { gmv: number; orders: number }>();
    for (const row of data) {
      const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
      dataMap.set(d, { gmv: Number(row.gmv) || 0, orders: Number(row.orders) || 0 });
    }

    const filled: { date: string; gmv: number; orders: number }[] = [];
    const cursor = new Date(range.currentStart);
    const end = new Date(range.currentEnd.getTime() - 1); // back off the +1ms
    while (cursor <= end) {
      const key = cursor.toISOString().split('T')[0];
      const entry = dataMap.get(key);
      filled.push({ date: key, gmv: entry?.gmv || 0, orders: entry?.orders || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return res.json(filled);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/top-anchors?limit=5
// Always ranks by all-time total_sales — anchor ranking reflects cumulative contribution
router.get('/top-anchors', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;

    const data = await knex('Anchor')
      .join('LiveSession', 'Anchor.anchor_id', 'LiveSession.anchor_id')
      .select(
        'Anchor.anchor_id',
        'Anchor.anchor_name',
        'Anchor.specialization',
        'Anchor.anchor_level',
        'Anchor.fan_count'
      )
      .sum('LiveSession.total_sales as total_gmv')
      .where('LiveSession.live_status', '已结束')
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

    const data = await knex('[Order]')
      .join('SKU', '[Order].sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .select('Product.category')
      .sum('[Order].order_amount as gmv')
      .count('* as order_count')
      .where('[Order].order_time', '>=', range.currentStart)
      .where('[Order].order_time', '<', range.currentEnd)
      .groupBy('Product.category')
      .orderBy('gmv', 'desc');

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

    const data = await knex('[Order]')
      .join('SKU', '[Order].sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .select(
        'Product.product_id',
        'Product.product_name',
        'Product.category',
        'Product.sale_price'
      )
      .sum('[Order].order_amount as gmv')
      .sum('[Order].order_quantity as quantity')
      .where('[Order].order_time', '>=', range.currentStart)
      .where('[Order].order_time', '<', range.currentEnd)
      .groupBy('Product.product_id', 'Product.product_name', 'Product.category', 'Product.sale_price')
      .orderBy('gmv', 'desc')
      .limit(limit);

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
