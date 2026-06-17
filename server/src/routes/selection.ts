import { Router, Request, Response } from 'express';
import { authenticate, authorize, ROLES } from '../middleware/auth';
import { getProductRankings, getRecommendations, getCategoryTrends, getAdvisorReport, coldStart } from '../services/selectionEngine';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ADMIN));

// GET /api/selection/rankings
router.get('/rankings', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string || '';
    const sortBy = req.query.sort as string || '';
    const search = req.query.search as string || '';
    const rankings = await getProductRankings(category, sortBy, search);
    return res.json(rankings);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/selection/recommendations/:productId
router.get('/recommendations/:productId', async (req: Request, res: Response) => {
  try {
    const recommendations = await getRecommendations(req.params.productId);
    return res.json(recommendations);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/selection/trends
router.get('/trends', async (_req: Request, res: Response) => {
  try {
    const trends = await getCategoryTrends();
    return res.json(trends);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/selection/advisor-report
router.get('/advisor-report', async (_req: Request, res: Response) => {
  try {
    const report = await getAdvisorReport();
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/selection/coldstart/:productId
router.post('/coldstart/:productId', async (req: Request, res: Response) => {
  try {
    const result = await coldStart(req.params.productId);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
