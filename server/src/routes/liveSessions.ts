import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { authenticate, authorize, getAnchorFilter, canAccessAnchor, ROLES } from '../middleware/auth';
import { addSSEClient, getSimulator, removeSSEClient, startSimulation, stopSimulation } from '../services/liveSimulator';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ANCHOR, ROLES.ADMIN));

/** Check anchor ownership for a live session; returns 403 if anchor user tries to access another's session */
async function checkSessionAccess(req: Request, liveId: string, res: Response) {
  const session = await knex('LiveSession').where('live_id', liveId).first();
  if (!session) { res.status(404).json({ message: '\u76f4\u64ad\u573a\u6b21\u4e0d\u5b58\u5728' }); return null; }
  if (!canAccessAnchor(req, session.anchor_id)) {
    res.status(403).json({ message: '\u65e0\u6743\u8bbf\u95ee\u5176\u4ed6\u4e3b\u64ad\u7684\u76f4\u64ad\u573a\u6b21' }); return null;
  }
  return session;
}

// SSE stream endpoint (must be before /:id)
router.get('/stream/:id', async (req: Request, res: Response) => {
  try {
    const liveId = req.params.id;
    const session = await checkSessionAccess(req, liveId, res);
    if (!session) return;
    if (!getSimulator(liveId)) {
      if (session.live_status === '\u8fdb\u884c\u4e2d') {
        await startSimulation(liveId, { preloadSeconds: 120, preserveStartTime: true });
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`event: connected\ndata: {"status":"connected","liveId":"${liveId}"}\n\n`);

    addSSEClient(liveId, res);

    req.on('close', () => {
      removeSSEClient(liveId, res);
    });
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ message: err.message });
  }
});

// GET /api/live-sessions
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as string || '';
    const search = req.query.search as string || '';
    const scope = getAnchorFilter(req);

    let query = knex('LiveSession')
      .join('Anchor', 'LiveSession.anchor_id', 'Anchor.anchor_id')
      .select('LiveSession.*', 'Anchor.anchor_name');

    if (scope.anchor_id) query = query.where('LiveSession.anchor_id', scope.anchor_id);
    if (status) query = query.where('LiveSession.live_status', status);
    if (search) {
      query = query.where(function () {
        this.where('LiveSession.live_title', 'like', `%${search}%`)
          .orWhere('Anchor.anchor_name', 'like', `%${search}%`)
          .orWhere('LiveSession.platform', 'like', `%${search}%`)
          .orWhere('LiveSession.live_category', 'like', `%${search}%`);
      });
    }

    const [{ count: total }] = await query.clone().clearSelect().count('* as count');

    // 排序
    const sortBy = req.query.sortBy as string || '';
    const sortDir = req.query.sortDir as string || 'asc';
    const allowedSorts: Record<string, string> = {
      live_title: 'LiveSession.live_title',
      anchor_name: 'Anchor.anchor_name',
      platform: 'LiveSession.platform',
      live_category: 'LiveSession.live_category',
      start_time: 'LiveSession.start_time',
      live_status: 'LiveSession.live_status',
      online_peak: 'LiveSession.online_peak',
      total_sales: 'LiveSession.total_sales',
    };
    const orderCol = allowedSorts[sortBy] || 'LiveSession.start_time';
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

// GET /api/live-sessions/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const session = await checkSessionAccess(req, req.params.id, res);
    if (!session) return;

    const full = await knex('LiveSession')
      .join('Anchor', 'LiveSession.anchor_id', 'Anchor.anchor_id')
      .select('LiveSession.*', 'Anchor.anchor_name')
      .where('LiveSession.live_id', req.params.id)
      .first();

    // Get products for this session
    const products = await knex('ProductPerformance')
      .join('Product', 'ProductPerformance.product_id', 'Product.product_id')
      .where('ProductPerformance.live_id', req.params.id)
      .select('Product.*', 'ProductPerformance.*');

    return res.json({ ...full, products });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/live-sessions
router.post('/', async (req: Request, res: Response) => {
  try {
    const scope = getAnchorFilter(req);
    const body = { ...req.body };
    // Force anchor's own anchor_id
    if (scope.anchor_id) body.anchor_id = scope.anchor_id;
    const id = uuid().replace(/-/g, '').substring(0, 16);
    const session = {
      live_id: id,
      ...body,
      start_time: body.start_time ? new Date(body.start_time) : null,
      live_status: body.live_status || '待安排',
    };
    await knex('LiveSession').insert(session);
    return res.status(201).json(session);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/live-sessions/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const session = await checkSessionAccess(req, req.params.id, res);
    if (!session) return;
    const scope = getAnchorFilter(req);
    const update = { ...req.body };
    if (update.start_time) update.start_time = new Date(update.start_time);
    if (scope.anchor_id) update.anchor_id = scope.anchor_id;
    await knex('LiveSession').where('live_id', req.params.id).update(update);
    const updated = await knex('LiveSession').where('live_id', req.params.id).first();
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/live-sessions/:id/simulate/start
router.post('/:id/simulate/start', async (req: Request, res: Response) => {
  try {
    const session = await checkSessionAccess(req, req.params.id, res);
    if (!session) return;
    await startSimulation(req.params.id, { preloadSeconds: 0, preserveStartTime: false });
    return res.json({ success: true, message: '直播模拟已启动' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/live-sessions/:id/simulate/stop
router.post('/:id/simulate/stop', async (req: Request, res: Response) => {
  try {
    const session = await checkSessionAccess(req, req.params.id, res);
    if (!session) return;
    await stopSimulation(req.params.id);
    return res.json({ success: true, message: '直播模拟已停止' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
