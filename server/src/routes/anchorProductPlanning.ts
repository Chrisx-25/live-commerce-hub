import { Router, Request, Response } from 'express';
import { authenticate, authorize, getAnchorFilter, canAccessAnchor, ROLES } from '../middleware/auth';
import {
  confirmLivePlan,
  createLivePlan,
  generateFitsForAnchor,
  generateFitsForProduct,
  getLivePlan,
  listAnchorProductFits,
  updateLivePlan,
} from '../services/anchorProductPlanningService';
import knex from '../db/knex';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ADMIN));

// GET /api/anchor-product-planning/fits
router.get('/fits', async (req: Request, res: Response) => {
  try {
    const scope = getAnchorFilter(req);
    const fits = await listAnchorProductFits({
      anchorId: (req.query.anchorId as string) || scope.anchor_id || undefined,
      productId: req.query.productId as string,
      category: req.query.category as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.json(fits);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/anchor-product-planning/fits/product/:productId
router.post('/fits/product/:productId', async (req: Request, res: Response) => {
  try {
    const fits = await generateFitsForProduct(req.params.productId, Number(req.body?.limit || 12));
    return res.status(201).json(fits);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/anchor-product-planning/fits/anchor/:anchorId
router.post('/fits/anchor/:anchorId', async (req: Request, res: Response) => {
  try {
    if (!canAccessAnchor(req, req.params.anchorId)) {
      return res.status(403).json({ message: '无权为其他主播生成选品匹配' });
    }
    const fits = await generateFitsForAnchor(req.params.anchorId, Number(req.body?.limit || 24));
    return res.status(201).json(fits);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/anchor-product-planning/plans/:liveId
router.post('/plans/:liveId', async (req: Request, res: Response) => {
  try {
    const session = await knex('LiveSession').where('live_id', req.params.liveId).first();
    if (!session) return res.status(404).json({ message: '直播场次不存在' });
    if (!canAccessAnchor(req, session.anchor_id)) {
      return res.status(403).json({ message: '无权为其他主播创建直播计划' });
    }
    const plan = await createLivePlan(req.params.liveId, req.body?.productIds);
    return res.status(201).json(plan);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/anchor-product-planning/plans/:id/confirm
router.post('/plans/:id/confirm', async (req: Request, res: Response) => {
  try {
    const plan = await confirmLivePlan(req.params.id);
    return res.json(plan);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/anchor-product-planning/plans/:id
router.put('/plans/:id', async (req: Request, res: Response) => {
  try {
    const plan = await updateLivePlan(req.params.id, req.body || {});
    return res.json(plan);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/anchor-product-planning/plans/:id
router.get('/plans/:id', async (req: Request, res: Response) => {
  try {
    const plan = await getLivePlan(req.params.id);
    if (!plan) return res.status(404).json({ message: '直播计划不存在' });
    return res.json(plan);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
