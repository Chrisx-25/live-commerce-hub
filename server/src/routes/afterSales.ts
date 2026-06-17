import { Router, Request, Response } from 'express';
import knex from '../db/knex';
import { authenticate, authorize, ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.PURCHASING, ROLES.WAREHOUSE, ROLES.ANCHOR, ROLES.ADMIN));

// GET /api/after-sales
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as string || '';
    const type = req.query.type as string || '';
    const level = req.query.level as string || '';

    let query = knex('AfterSale')
      .join('[Order]', 'AfterSale.order_id', '[Order].order_id')
      .join('User', '[Order].user_id', 'User.user_id')
      .select('AfterSale.*', '[Order].order_amount', 'User.nickname', 'User.user_id');

    if (status) query = query.where('AfterSale.process_status', status);
    if (type) query = query.where('AfterSale.aftersale_type', type);
    if (level) query = query.where('AfterSale.complaint_level', level);

    const sortBy = req.query.sortBy as string || '';
    const sortDir = req.query.sortDir as string || 'asc';
    const allowedSorts: Record<string, string> = {
      aftersale_type: 'AfterSale.aftersale_type',
      process_status: 'AfterSale.process_status',
      refund_amount: 'AfterSale.refund_amount',
      complaint_level: 'AfterSale.complaint_level',
      create_time: 'AfterSale.create_time',
      order_amount: '[Order].order_amount',
      nickname: 'User.nickname',
    };
    const [{ count: total }] = await query.clone().clearSelect().count('* as count');
    const orderCol = allowedSorts[sortBy] || 'AfterSale.create_time';
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

// PUT /api/after-sales/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    await knex('AfterSale').where('aftersale_id', req.params.id).update(req.body);
    const record = await knex('AfterSale').where('aftersale_id', req.params.id).first();
    return res.json(record);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
