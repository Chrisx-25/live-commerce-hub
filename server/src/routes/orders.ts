import { Router, Request, Response } from 'express';
import knex from '../db/knex';
import { authenticate, authorize, ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ADMIN));

// GET /api/orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const liveId = req.query.live_id as string || '';

    let query = knex('[Order]')
      .join('User', '[Order].user_id', 'User.user_id')
      .join('SKU', '[Order].sku_id', 'SKU.sku_id')
      .join('Product', 'SKU.product_id', 'Product.product_id')
      .select('[Order].*', 'User.nickname', 'SKU.sku_name', 'Product.product_name');

    if (liveId) query = query.where('[Order].live_id', liveId);

    const [{ count: total }] = await query.clone().clearSelect().count('* as count');
    const data = await query
      .orderBy('[Order].order_time', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({ data, total: Number(total), page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
