import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/purchases
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as string || '';
    const search = req.query.search as string || '';

    let query = knex('PurchaseOrder')
      .join('Supplier', 'PurchaseOrder.supplier_id', 'Supplier.supplier_id')
      .join('SKU', 'PurchaseOrder.sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .select(
        'PurchaseOrder.*',
        'Supplier.supplier_name',
        'SKU.sku_name',
        'Product.product_name'
      );

    if (status) query = query.where('PurchaseOrder.purchase_status', status);
    if (search) query = query.where('Product.product_name', 'like', `%${search}%`);

    // 排序
    const sortBy = req.query.sortBy as string || '';
    const sortDir = req.query.sortDir as string || 'asc';
    const allowedSorts: Record<string, string> = {
      product_name: 'Product.product_name',
      sku_name: 'SKU.sku_name',
      supplier_name: 'Supplier.supplier_name',
      purchase_quantity: 'PurchaseOrder.purchase_quantity',
      purchase_price: 'PurchaseOrder.purchase_price',
      purchase_status: 'PurchaseOrder.purchase_status',
      expected_arrival_time: 'PurchaseOrder.expected_arrival_time',
    };
    const orderCol = allowedSorts[sortBy] || 'PurchaseOrder.create_time';
    const direction = sortDir === 'desc' ? 'desc' : 'asc';

    const [{ count: total }] = await query.clone().clearSelect().count('* as count');
    const data = await query
      .orderBy(orderCol, direction)
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({ data, total: Number(total), page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/purchases/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const purchase = await knex('PurchaseOrder')
      .join('Supplier', 'PurchaseOrder.supplier_id', 'Supplier.supplier_id')
      .join('SKU', 'PurchaseOrder.sku_id', 'SKU.sku_id')
      .select('PurchaseOrder.*', 'Supplier.supplier_name', 'SKU.sku_name')
      .where('PurchaseOrder.purchase_id', req.params.id)
      .first();
    if (!purchase) return res.status(404).json({ message: '采购单不存在' });
    return res.json(purchase);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/purchases
router.post('/', async (req: Request, res: Response) => {
  try {
    const id = uuid().replace(/-/g, '').substring(0, 16);
    const purchase = {
      purchase_id: id,
      ...req.body,
      create_time: new Date(),
    };
    await knex('PurchaseOrder').insert(purchase);
    return res.status(201).json(purchase);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/purchases/new-product
router.post('/new-product', async (req: Request, res: Response) => {
  try {
    const productId = uuid().replace(/-/g, '').substring(0, 16);
    const skuId = uuid().replace(/-/g, '').substring(0, 16);
    const inventoryId = uuid().replace(/-/g, '').substring(0, 16);
    const purchaseId = uuid().replace(/-/g, '').substring(0, 16);

    const costPrice = Number(req.body.cost_price) || Number(req.body.purchase_price) || 0;
    const salePrice = Number(req.body.sale_price) || Math.round(costPrice * 1.35 * 100) / 100;
    const purchaseQuantity = Number(req.body.purchase_quantity) || 0;
    if (!req.body.product_name || !req.body.category || !req.body.supplier_id || !purchaseQuantity || !costPrice) {
      return res.status(400).json({ message: '新品名称、品类、供应商、采购数量和采购价不能为空' });
    }

    const now = new Date();
    const result = await knex.transaction(async (trx) => {
      const product = {
        product_id: productId,
        product_name: req.body.product_name,
        category: req.body.category,
        brand: req.body.brand || '新品候选',
        cost_price: costPrice,
        sale_price: salePrice,
        gross_profit_rate: salePrice > 0 ? Number((((salePrice - costPrice) / salePrice) * 100).toFixed(2)) : 0,
        product_status: '待评估',
        supplier_id: req.body.supplier_id,
        description: req.body.description || '由新品采购流程创建，进入冷启动评估候选池。',
        selling_points: req.body.selling_points || '待直播试播验证',
        create_time: now,
      };
      const sku = {
        sku_id: skuId,
        product_id: productId,
        sku_name: req.body.sku_name || `${req.body.product_name} 默认SKU`,
        color: req.body.color || '默认',
        size: req.body.size || '默认',
        specification: req.body.specification || '标准规格',
        stock_quantity: 0,
        warning_threshold: Number(req.body.warning_threshold) || Math.max(50, Math.ceil(purchaseQuantity * 0.3)),
        sales_volume: 0,
        sku_status: '在售',
      };
      const inventory = {
        inventory_id: inventoryId,
        sku_id: skuId,
        warehouse_name: req.body.warehouse_name || '主仓',
        batch_number: req.body.batch_number || `NEW-${productId.slice(0, 6)}`,
        current_stock: Number(req.body.initial_stock) || 0,
        inbound_quantity: 0,
        outbound_quantity: 0,
        safety_stock: Number(req.body.safety_stock) || Math.max(30, Math.ceil(purchaseQuantity * 0.2)),
        inventory_status: '正常',
        last_update_time: now,
      };
      const purchase = {
        purchase_id: purchaseId,
        supplier_id: req.body.supplier_id,
        sku_id: skuId,
        purchase_quantity: purchaseQuantity,
        purchase_price: Number(req.body.purchase_price) || costPrice,
        purchase_status: '待审核',
        expected_arrival_time: req.body.expected_arrival_time || null,
        create_time: now,
      };

      await trx('Product').insert(product);
      await trx('SKU').insert(sku);
      await trx('Inventory').insert(inventory);
      await trx('PurchaseOrder').insert(purchase);
      return { product, sku, inventory, purchase };
    });

    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/purchases/:id/status
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const update: any = { purchase_status: status };
    if (status === '已入库') {
      update.actual_arrival_time = new Date();
      // Update inventory
      const purchase = await knex('PurchaseOrder').where('purchase_id', req.params.id).first();
      if (purchase) {
        const inventory = await knex('Inventory').where('sku_id', purchase.sku_id).first();
        if (inventory) {
          await knex('Inventory').where('inventory_id', inventory.inventory_id).update({
            current_stock: inventory.current_stock + purchase.purchase_quantity,
            inbound_quantity: inventory.inbound_quantity + purchase.purchase_quantity,
            last_update_time: new Date(),
          });
        }
      }
    }
    await knex('PurchaseOrder').where('purchase_id', req.params.id).update(update);
    const record = await knex('PurchaseOrder').where('purchase_id', req.params.id).first();
    return res.json(record);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/purchases/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await knex('PurchaseOrder').where('purchase_id', req.params.id).del();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
