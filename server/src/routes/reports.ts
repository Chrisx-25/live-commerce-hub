import { Router, Request, Response } from 'express';
import knex from '../db/knex';
import { authenticate, authorize, ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.PURCHASING, ROLES.WAREHOUSE, ROLES.ADMIN));

// GET /api/reports
router.get('/', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string || '';
    let query = knex('OperationReport')
      .leftJoin('Employee', 'OperationReport.creator_id', 'Employee.employee_id')
      .select('OperationReport.*', 'Employee.employee_name as creator_name');

    if (type) query = query.where('OperationReport.report_type', type);

    const data = await query.orderBy('OperationReport.create_time', 'desc');
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const report = await knex('OperationReport').where('report_id', req.params.id).first();
    if (!report) return res.status(404).json({ message: '报告不存在' });
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
