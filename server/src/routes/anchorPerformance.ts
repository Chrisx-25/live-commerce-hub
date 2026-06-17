import { Router, Request, Response } from 'express';
import { authenticate, authorize, getAnchorFilter, canAccessAnchor, ROLES } from '../middleware/auth';
import { getAnchorPerformance, getAnchorRadarByAnchorId } from '../services/performance';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ANCHOR, ROLES.ADMIN));

// GET /api/anchor-performance
router.get('/', async (req: Request, res: Response) => {
  try {
    const scope = getAnchorFilter(req);
    const anchorId = (req.query.anchor_id as string) || scope.anchor_id || '';
    const liveId = req.query.live_id as string || '';
    const data = await getAnchorPerformance(anchorId, liveId);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/anchor-performance/:id/radar
router.get('/:id/radar', async (req: Request, res: Response) => {
  try {
    if (!canAccessAnchor(req, req.params.id)) {
      return res.status(403).json({ message: '无权查看其他主播的雷达图' });
    }
    const radar = await getAnchorRadarByAnchorId(req.params.id);
    return res.json(radar);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
