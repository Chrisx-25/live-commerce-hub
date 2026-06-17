import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { authenticate, authorize, ROLES } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.PURCHASING, ROLES.ADMIN));

// GET /api/suppliers
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string || '';

    let query = knex('Supplier');
    if (search) query = query.where('supplier_name', 'like', `%${search}%`);

    const [{ count: total }] = await query.clone().clearSelect().count('* as count');
    const data = await query
      .orderBy('supplier_score', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({ data, total: Number(total), page, pageSize });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supplier = await knex('Supplier').where('supplier_id', req.params.id).first();
    if (!supplier) return res.status(404).json({ message: '供应商不存在' });
    return res.json(supplier);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/suppliers
router.post('/', async (req: Request, res: Response) => {
  try {
    const id = uuid().replace(/-/g, '').substring(0, 16);
    const supplier = { supplier_id: id, ...req.body };
    await knex('Supplier').insert(supplier);
    return res.status(201).json(supplier);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    await knex('Supplier').where('supplier_id', req.params.id).update(req.body);
    const supplier = await knex('Supplier').where('supplier_id', req.params.id).first();
    return res.json(supplier);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await knex('Supplier').where('supplier_id', req.params.id).del();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
