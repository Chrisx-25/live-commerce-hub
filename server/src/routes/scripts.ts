import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import knex from '../db/knex';
import { authenticate, authorize, getAnchorFilter, canAccessAnchor, ROLES } from '../middleware/auth';
import { generateScript } from '../services/llmService';

const router = Router();
router.use(authenticate);
router.use(authorize(ROLES.MANAGEMENT, ROLES.OPERATIONS, ROLES.ANCHOR, ROLES.ADMIN));

// GET /api/scripts
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string || '';
    const scope = getAnchorFilter(req);

    let query = knex('Script')
      .leftJoin('Product', 'Script.product_id', 'Product.product_id')
      .leftJoin('Anchor', 'Script.anchor_id', 'Anchor.anchor_id')
      .select('Script.*', 'Product.product_name', 'Anchor.anchor_name');

    if (scope.anchor_id) query = query.where('Script.anchor_id', scope.anchor_id);
    if (search) {
      query = query.where('Product.product_name', 'like', `%${search}%`);
    }

    // MSSQL requires separate count query
    let countQuery = knex('Script')
      .leftJoin('Product', 'Script.product_id', 'Product.product_id')
      .leftJoin('Anchor', 'Script.anchor_id', 'Anchor.anchor_id');
    if (scope.anchor_id) countQuery = countQuery.where('Script.anchor_id', scope.anchor_id);
    if (search) {
      countQuery = countQuery.where('Product.product_name', 'like', `%${search}%`);
    }
    const [{ count: total }] = await countQuery.count('* as count');

    // 排序
    const sortBy = req.query.sortBy as string || '';
    const sortDir = req.query.sortDir as string || 'asc';
    const allowedSorts: Record<string, string> = {
      script_title: 'Script.script_title',
      product_name: 'Product.product_name',
      script_type: 'Script.script_type',
      tags: 'Script.tags',
      conversion_rate: 'Script.conversion_rate',
      recommendation_level: 'Script.recommendation_level',
    };
    const orderCol = allowedSorts[sortBy] || 'Script.create_time';
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

// GET /api/scripts/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const script = await knex('Script').where('script_id', req.params.id).first();
    if (!script) return res.status(404).json({ message: '脚本不存在' });
    return res.json(script);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/scripts
router.post('/', async (req: Request, res: Response) => {
  try {
    const scope = getAnchorFilter(req);
    const body = { ...req.body };
    // Force anchor's own anchor_id
    if (scope.anchor_id) body.anchor_id = scope.anchor_id;
    const id = uuid().replace(/-/g, '').substring(0, 16);
    const script = { script_id: id, ...body, create_time: new Date() };
    await knex('Script').insert(script);
    return res.status(201).json(script);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/scripts/generate — LLM生成脚本内容（不存库，返回纯内容由前端决定是否保存）
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { productId, scriptType, style } = req.body;
    if (!productId) return res.status(400).json({ message: '请选择商品' });

    const product = await knex('Product').where('product_id', productId).first();
    if (!product) return res.status(404).json({ message: '商品不存在' });

    const scriptContent = await generateScript(product, scriptType || '讲解', style || '专业');

    return res.json({
      product_name: product.product_name,
      product_id: productId,
      script_type: scriptType || '讲解',
      script_title: `${product.product_name} - ${scriptType || '讲解'}脚本`,
      script_content: scriptContent,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PUT /api/scripts/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await knex('Script').where('script_id', req.params.id).first();
    if (!existing) return res.status(404).json({ message: '脚本不存在' });
    if (!canAccessAnchor(req, existing.anchor_id)) {
      return res.status(403).json({ message: '无权修改其他主播的脚本' });
    }
    const scope = getAnchorFilter(req);
    const update = { ...req.body };
    if (scope.anchor_id) update.anchor_id = scope.anchor_id;
    await knex('Script').where('script_id', req.params.id).update(update);
    const script = await knex('Script').where('script_id', req.params.id).first();
    return res.json(script);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// DELETE /api/scripts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await knex('Script').where('script_id', req.params.id).first();
    if (!existing) return res.status(404).json({ message: '脚本不存在' });
    if (!canAccessAnchor(req, existing.anchor_id)) {
      return res.status(403).json({ message: '无权删除其他主播的脚本' });
    }
    await knex('Script').where('script_id', req.params.id).del();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
