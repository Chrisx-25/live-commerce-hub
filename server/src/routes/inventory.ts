import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { authenticate, authorize, ROLES } from '../middleware/auth';
import { buildInventoryPlans } from '../services/inventoryPlanning';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.WAREHOUSE, ROLES.ADMIN));

// GET /api/inventory
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const warehouse = req.query.warehouse as string || '';
    const status = req.query.status as string || '';
    const search = req.query.search as string || '';

    let query = knex('Inventory')
      .join('SKU', 'Inventory.sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .select(
        'Inventory.*',
        'SKU.product_id',
        'SKU.sku_name',
        'SKU.color',
        'SKU.size',
        'SKU.warning_threshold',
        'SKU.sales_volume',
        'Product.product_name',
        'Product.category',
        'Product.product_status',
        'Product.cost_price',
        'Product.supplier_id',
        'Supplier.supplier_name',
        'Supplier.delivery_cycle'
      );
    query = query.leftJoin('Supplier', 'Product.supplier_id', 'Supplier.supplier_id');

    if (warehouse) query = query.where('Inventory.warehouse_name', warehouse);
    if (status === '不足') query = query.where('Inventory.current_stock', '<=', knex.raw('Inventory.safety_stock'));
    else if (status === '正常') query = query.where('Inventory.current_stock', '>', knex.raw('Inventory.safety_stock'));
    if (search) query = query.where('Product.product_name', 'like', `%${search}%`);

    // 排序
    const sortBy = req.query.sortBy as string || '';
    const sortDir = req.query.sortDir as string || 'asc';
    const direction = sortDir === 'desc' ? 'desc' : 'asc';

    const [{ count: total }] = await query.clone().clearSelect().count('* as count');

    // stock_risk_level 是计算字段，需在内存中排序
    if (sortBy === 'stock_risk_level') {
      const allRows = await query;
      let plans = await buildInventoryPlans(allRows);
      plans.sort((a: any, b: any) =>
        direction === 'desc'
          ? (b.stock_risk_score || 0) - (a.stock_risk_score || 0)
          : (a.stock_risk_score || 0) - (b.stock_risk_score || 0)
      );
      const data = plans.slice((page - 1) * pageSize, page * pageSize);
      return res.json({ data, total: Number(total), page, pageSize });
    }

    const allowedSorts: Record<string, string> = {
      product_name: 'Product.product_name',
      sku_name: 'SKU.sku_name',
      warehouse_name: 'Inventory.warehouse_name',
      current_stock: 'Inventory.current_stock',
      safety_stock: 'Inventory.safety_stock',
      predicted_sales_30d: 'predicted_sales_30d',
    };
    const orderCol = allowedSorts[sortBy] || 'Inventory.last_update_time';

    const rows = await query
      .orderBy(orderCol, direction)
      .offset((page - 1) * pageSize)
      .limit(pageSize);
    const data = await buildInventoryPlans(rows);

    return res.json({ data, total: Number(total), page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/alerts
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const base = knex('Inventory')
      .join('SKU', 'Inventory.sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .select(
        'Inventory.*',
        'SKU.product_id',
        'SKU.sku_name',
        'SKU.stock_quantity as sku_stock',
        'SKU.warning_threshold',
        'SKU.sales_volume',
        'Product.product_name',
        'Product.category',
        'Product.product_status',
        'Product.cost_price',
        'Product.supplier_id',
        'Supplier.supplier_name',
        'Supplier.delivery_cycle'
      )
      .leftJoin('Supplier', 'Product.supplier_id', 'Supplier.supplier_id')
      .where('Inventory.current_stock', '<=', knex.raw('Inventory.safety_stock'));

    const [{ count: total }] = await base.clone().clearSelect().count('* as count');

    const rows = await base
      .orderBy('Inventory.current_stock', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize);
    const data = await buildInventoryPlans(rows);

    return res.json({ data, total: Number(total), page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/batch-purchase — 一键采购：为所有需要采购的库存项生成采购单
router.post('/batch-purchase', async (req: Request, res: Response) => {
  try {
    // 获取所有库存项（不分页），筛选建议采购数量 > 0 的项
    const rows = await knex('Inventory')
      .join('SKU', 'Inventory.sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .leftJoin('Supplier', 'Product.supplier_id', 'Supplier.supplier_id')
      .select(
        'Inventory.*',
        'SKU.product_id',
        'SKU.sku_name',
        'SKU.warning_threshold',
        'SKU.sales_volume',
        'Product.product_name',
        'Product.category',
        'Product.product_status',
        'Product.cost_price',
        'Product.supplier_id',
        'Supplier.supplier_name',
        'Supplier.delivery_cycle'
      );

    const plans = await buildInventoryPlans(rows);
    const purchasable = plans.filter((p: any) => (p.suggested_quantity || 0) > 0 && p.supplier_id);

    let created = 0;
    let skipped = 0;
    const now = new Date();

    for (const item of purchasable) {
      try {
        const purchaseId = uuid().replace(/-/g, '').substring(0, 16);
        const arrivalDate = new Date(now);
        arrivalDate.setDate(arrivalDate.getDate() + Math.max(item.delivery_cycle || 7, 1));

        await knex('PurchaseOrder').insert({
          purchase_id: purchaseId,
          supplier_id: item.supplier_id,
          sku_id: item.sku_id,
          purchase_quantity: item.suggested_quantity,
          purchase_price: Number(item.cost_price) || 0,
          purchase_status: '待审核',
          expected_arrival_time: arrivalDate,
          create_time: now,
        });

        // Reset inventory risk to 正常 after purchase
        const inv = await knex('Inventory').where('sku_id', item.sku_id).first();
        if (inv) {
          const newStock = Math.max(inv.current_stock || 0, inv.safety_stock || 20);
          await knex('Inventory')
            .where('sku_id', item.sku_id)
            .update({
              inventory_status: '正常',
              current_stock: newStock,
              last_update_time: now,
            });
          await knex('SKU').where('sku_id', item.sku_id).update({ stock_quantity: newStock });
        }

        created++;
      } catch {
        skipped++;
      }
    }

    return res.json({ created, skipped });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    await knex('Inventory').where('inventory_id', req.params.id).update({
      ...req.body,
      last_update_time: new Date(),
    });
    const record = await knex('Inventory').where('inventory_id', req.params.id).first();
    return res.json(record);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
