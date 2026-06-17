import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { authenticate, authorize, ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ADMIN));

// GET /api/products
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string || '';
    const category = req.query.category as string || '';
    const status = req.query.status as string || '';
    const sortBy = req.query.sortBy as string || '';
    const sortDir = req.query.sortDir as string || 'asc';

    // Allowed sort columns (prevent SQL injection)
    const allowedSorts: Record<string, string> = {
      product_name: 'Product.product_name',
      brand: 'Product.brand',
      supplier_name: 'Supplier.supplier_name',
      cost_price: 'Product.cost_price',
      sale_price: 'Product.sale_price',
      gross_profit_rate: 'Product.gross_profit_rate',
      category: 'Product.category',
    };

    let query = knex('Product')
      .leftJoin('Supplier', 'Product.supplier_id', 'Supplier.supplier_id')
      .select('Product.*', 'Supplier.supplier_name');

    if (search) {
      query = query.where(function () {
        this.where('Product.product_name', 'like', `%${search}%`)
          .orWhere('Product.brand', 'like', `%${search}%`);
      });
    }
    if (category) query = query.where('Product.category', category);
    if (status) query = query.where('Product.product_status', status);

    // MSSQL requires separate count query (cannot mix * with aggregate)
    let countQuery = knex('Product')
      .leftJoin('Supplier', 'Product.supplier_id', 'Supplier.supplier_id');
    if (search) {
      countQuery = countQuery.where(function () {
        this.where('Product.product_name', 'like', `%${search}%`)
          .orWhere('Product.brand', 'like', `%${search}%`);
      });
    }
    if (category) countQuery = countQuery.where('Product.category', category);
    if (status) countQuery = countQuery.where('Product.product_status', status);
    const [{ count: total }] = await countQuery.count('* as count');

    const orderCol = allowedSorts[sortBy] || 'Product.create_time';
    const direction = sortDir === 'desc' ? 'desc' : 'asc';

    const data = await query
      .orderBy(orderCol, direction)
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({ data, total: Number(total), page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await knex('Product')
      .leftJoin('Supplier', 'Product.supplier_id', 'Supplier.supplier_id')
      .select('Product.*', 'Supplier.supplier_name')
      .where('Product.product_id', req.params.id)
      .first();
    if (!product) return res.status(404).json({ message: '商品不存在' });
    return res.json(product);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/products
router.post('/', async (req: Request, res: Response) => {
  try {
    const id = uuid().replace(/-/g, '').substring(0, 16);
    const { is_new, ...body } = req.body; // 排除前端 is_new 标记（数据库无此列）
    const product = {
      product_id: id,
      ...body,
      gross_profit_rate: body.cost_price && body.sale_price
        ? parseFloat((((body.sale_price - body.cost_price) / body.sale_price) * 100).toFixed(2))
        : null,
      create_time: new Date(),
    };
    await knex('Product').insert(product);
    return res.status(201).json(product);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { is_new, ...update } = req.body; // 排除前端 is_new 标记（数据库无此列）
    if (req.body.cost_price && req.body.sale_price) {
      update.gross_profit_rate = parseFloat((((req.body.sale_price - req.body.cost_price) / req.body.sale_price) * 100).toFixed(2));
    }
    await knex('Product').where('product_id', req.params.id).update(update);
    const product = await knex('Product').where('product_id', req.params.id).first();
    return res.json(product);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await knex('Product').where('product_id', req.params.id).del();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id/skus
router.get('/:id/skus', async (req: Request, res: Response) => {
  try {
    const skus = await knex('SKU')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .leftJoin('Supplier', 'Product.supplier_id', 'Supplier.supplier_id')
      .select('SKU.*', 'Product.product_name', 'Product.cost_price', 'Product.supplier_id', 'Supplier.supplier_name')
      .where('SKU.product_id', req.params.id)
      .where('SKU.sku_status', '在售');
    return res.json(skus);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
