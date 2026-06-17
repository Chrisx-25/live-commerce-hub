import { Router, Request, Response } from 'express';
import { authenticate, authorize, ROLES } from '../middleware/auth';
import { resetSystemToAcceptanceState } from '../services/systemReset';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.ADMIN));

router.post('/reset', async (_req: Request, res: Response) => {
  try {
    const result = await resetSystemToAcceptanceState();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
