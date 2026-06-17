import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { authenticate, authorize, getAnchorFilter, ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ADMIN));

// GET /api/anchors
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string || '';
    const level = req.query.level as string || '';
    const status = req.query.status as string || '';
    const scope = getAnchorFilter(req);

    let query = knex('Anchor');

    if (scope.anchor_id) query = query.where('anchor_id', scope.anchor_id);
    if (search) query = query.where('anchor_name', 'like', `%${search}%`);
    if (level) query = query.where('anchor_level', level);
    if (status) query = query.where('status', status);

    const sortBy = req.query.sortBy as string || '';
    const sortDir = req.query.sortDir as string || 'asc';
    const allowedSorts: Record<string, string> = {
      anchor_name: 'anchor_name',
      gender: 'gender',
      join_date: 'join_date',
      account_platform: 'account_platform',
      fan_count: 'fan_count',
      specialization: 'specialization',
      anchor_level: 'anchor_level',
      status: 'status',
    };
    const [{ count: total }] = await query.clone().clearSelect().count('* as count');
    const orderCol = allowedSorts[sortBy] || 'fan_count';
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

// GET /api/anchors/:id/detail — full detail with stats
router.get('/:id/detail', async (req: Request, res: Response) => {
  try {
    const anchorId = req.params.id;
    const anchor = await knex('Anchor').where('anchor_id', anchorId).first();
    if (!anchor) return res.status(404).json({ message: '主播不存在' });

    // Performance stats
    const perfStats = await knex('AnchorPerformance')
      .where('anchor_id', anchorId)
      .select(
        knex.raw('COUNT(*) as total_sessions'),
        knex.raw('AVG(conversion_rate) as avg_conversion'),
        knex.raw('AVG(average_watch_time) as avg_watch_time'),
        knex.raw('AVG(interaction_rate) as avg_interaction'),
        knex.raw('AVG(performance_score) as avg_performance')
      )
      .first();

    // Recent performances
    const recentPerformances = await knex('AnchorPerformance')
      .join('LiveSession', 'AnchorPerformance.live_id', 'LiveSession.live_id')
      .where('AnchorPerformance.anchor_id', anchorId)
      .select(
        'AnchorPerformance.*',
        'LiveSession.live_title',
        'LiveSession.start_time'
      )
      .orderBy('AnchorPerformance.evaluation_time', 'desc')
      .limit(10);

    // Recent live sessions
    const recentSessions = await knex('LiveSession')
      .where('anchor_id', anchorId)
      .orderBy('start_time', 'desc')
      .limit(10);

    // Total GMV
    const gmvResult = await knex('LiveSession')
      .where('anchor_id', anchorId)
      .sum('total_sales as total_gmv')
      .first();

    // Radar data
    const perfs = await knex('AnchorPerformance')
      .where('anchor_id', anchorId)
      .orderBy('evaluation_time', 'desc')
      .limit(5);

    let radar = null;
    if (perfs.length > 0) {
      const avgConv = perfs.reduce((s, p) => s + Number(p.conversion_rate), 0) / perfs.length;
      const avgWatch = perfs.reduce((s, p) => s + Number(p.average_watch_time), 0) / perfs.length;
      const avgInter = perfs.reduce((s, p) => s + Number(p.interaction_rate), 0) / perfs.length;
      const avgScript = perfs.reduce((s, p) => s + Number(p.script_execution_score), 0) / perfs.length;
      const avgScore = perfs.reduce((s, p) => s + Number(p.performance_score), 0) / perfs.length;
      radar = {
        dimensions: [
          { name: '转化力', value: +avgConv.toFixed(1), max: 10 },
          { name: '控场力', value: +(avgWatch / 60).toFixed(1), max: 10 },
          { name: '互动引导', value: +avgInter.toFixed(1), max: 10 },
          { name: '脚本执行', value: +(avgScript / 10).toFixed(1), max: 10 },
          { name: '用户粘性', value: +(avgScore / 10).toFixed(1), max: 10 },
        ],
        performance_score: +avgScore.toFixed(1),
      };
    }

    return res.json({
      anchor,
      stats: {
        totalGmv: Number(gmvResult?.total_gmv) || 0,
        totalSessions: Number(perfStats?.total_sessions) || 0,
        avgConversion: Number(perfStats?.avg_conversion) || 0,
        avgWatchTime: Number(perfStats?.avg_watch_time) || 0,
        avgInteraction: Number(perfStats?.avg_interaction) || 0,
        avgPerformance: Number(perfStats?.avg_performance) || 0,
      },
      radar,
      recentPerformances,
      recentSessions,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/anchors/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const anchor = await knex('Anchor').where('anchor_id', req.params.id).first();
    if (!anchor) return res.status(404).json({ message: '主播不存在' });
    return res.json(anchor);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/anchors
router.post('/', async (req: Request, res: Response) => {
  try {
    const id = uuid().replace(/-/g, '').substring(0, 16);
    const anchor = { anchor_id: id, ...req.body };
    await knex('Anchor').insert(anchor);
    return res.status(201).json(anchor);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/anchors/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    await knex('Anchor').where('anchor_id', req.params.id).update(req.body);
    const anchor = await knex('Anchor').where('anchor_id', req.params.id).first();
    return res.json(anchor);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/anchors/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await knex('Anchor').where('anchor_id', req.params.id).del();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
