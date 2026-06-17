import { Router, Request, Response } from 'express';
import { authenticate, authorize, getAnchorFilter, canAccessAnchor, ROLES } from '../middleware/auth';
import {
  generateLiveSessionReview,
  getLiveSessionReview,
  getReviewAnchorAnalysis,
  getReviewProductAnalysis,
  listLiveSessionReviews,
} from '../services/liveReviewService';
import knex from '../db/knex';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ANCHOR, ROLES.ADMIN));

// GET /api/live-reviews
router.get('/', async (req: Request, res: Response) => {
  try {
    const scope = getAnchorFilter(req);
    const reviews = await listLiveSessionReviews(scope.anchor_id);
    return res.json(reviews);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/live-reviews/generate/:liveId
router.post('/generate/:liveId', async (req: Request, res: Response) => {
  try {
    const session = await knex('LiveSession').where('live_id', req.params.liveId).first();
    if (!session) return res.status(404).json({ message: '\u76f4\u64ad\u573a\u6b21\u4e0d\u5b58\u5728' });
    if (!canAccessAnchor(req, session.anchor_id)) {
      return res.status(403).json({ message: '\u65e0\u6743\u4e3a\u5176\u4ed6\u4e3b\u64ad\u7684\u76f4\u64ad\u751f\u6210\u590d\u76d8' });
    }
    const review = await generateLiveSessionReview(req.params.liveId);
    return res.status(201).json(review);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/live-reviews/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const review = await getLiveSessionReview(req.params.id);
    if (!review) return res.status(404).json({ message: '\u590d\u76d8\u4e0d\u5b58\u5728' });
    if (!canAccessAnchor(req, review.anchor_id)) {
      return res.status(403).json({ message: '\u65e0\u6743\u67e5\u770b\u5176\u4ed6\u4e3b\u64ad\u7684\u590d\u76d8' });
    }
    return res.json(review);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/live-reviews/:id/products
router.get('/:id/products', async (req: Request, res: Response) => {
  try {
    const review = await getLiveSessionReview(req.params.id);
    if (!review) return res.status(404).json({ message: '\u590d\u76d8\u4e0d\u5b58\u5728' });
    if (!canAccessAnchor(req, review.anchor_id)) {
      return res.status(403).json({ message: '\u65e0\u6743\u67e5\u770b\u5176\u4ed6\u4e3b\u64ad\u7684\u590d\u76d8' });
    }
    const analysis = await getReviewProductAnalysis(req.params.id);
    return res.json(analysis);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/live-reviews/:id/anchor
router.get('/:id/anchor', async (req: Request, res: Response) => {
  try {
    const review = await getLiveSessionReview(req.params.id);
    if (!review) return res.status(404).json({ message: '\u590d\u76d8\u4e0d\u5b58\u5728' });
    if (!canAccessAnchor(req, review.anchor_id)) {
      return res.status(403).json({ message: '\u65e0\u6743\u67e5\u770b\u5176\u4ed6\u4e3b\u64ad\u7684\u590d\u76d8' });
    }
    const analysis = await getReviewAnchorAnalysis(req.params.id);
    return res.json(analysis);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
