import { Router, Request, Response } from 'express';
import { authenticate, authorize, ROLES } from '../middleware/auth';
import { generateSuggestions } from '../services/purchaseSuggestion';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.PURCHASING, ROLES.WAREHOUSE, ROLES.ADMIN));

// GET /api/purchase-suggestions
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const all = await generateSuggestions();
    const total = all.length;
    const start = (page - 1) * pageSize;
    const data = all.slice(start, start + pageSize);
    return res.json({ data, total, page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
