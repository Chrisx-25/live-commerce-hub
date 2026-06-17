import { Router, Request, Response } from 'express';
import knex from '../db/knex';
import { authenticate, authorize, ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ADMIN));

// GET /api/interactions
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const liveId = req.query.live_id as string || '';
    const sentiment = req.query.sentiment as string || '';

    let query = knex('InteractionLog')
      .leftJoin('User', 'InteractionLog.user_id', 'User.user_id')
      .select('InteractionLog.*', 'User.nickname');

    if (liveId) query = query.where('InteractionLog.live_id', liveId);
    if (sentiment) query = query.where('InteractionLog.sentiment_label', sentiment);

    const [{ count: total }] = await query.clone().clearSelect().count('* as count');
    const data = await query
      .orderBy('InteractionLog.interaction_time', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({ data, total: Number(total), page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
