import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import knex from '../db/knex';
import { config } from '../config';
import { authenticate, authorize, ROLES } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { employee_id, password } = req.body;
    if (!employee_id || !password) {
      return res.status(400).json({ message: '请输入员工编号和密码' });
    }

    const employee = await knex('Employee').where('employee_id', employee_id).first();
    if (!employee) {
      return res.status(401).json({ message: '员工编号或密码错误' });
    }

    const valid = await bcrypt.compare(password, employee.password_hash || '');
    if (!valid) {
      return res.status(401).json({ message: '员工编号或密码错误' });
    }

    // Get roles
    const empRoles = await knex('EmployeeRole')
      .join('Role', 'EmployeeRole.role_id', 'Role.role_id')
      .where('EmployeeRole.employee_id', employee_id)
      .select('Role.role_id', 'Role.role_name');

    const roles = empRoles.map((r: any) => r.role_name);
    const roleIds = empRoles.map((r: any) => r.role_id);

    // Get permissions
    const perms = await knex('RolePermission')
      .join('Permission', 'RolePermission.permission_id', 'Permission.permission_id')
      .whereIn('RolePermission.role_id', roleIds)
      .select('Permission.permission_name')
      .distinct();

    const permissions = perms.map((p: any) => p.permission_name);

    const tokenPayload: any = { employee_id: employee.employee_id, roles };
    if (employee.anchor_id) tokenPayload.anchor_id = employee.anchor_id;

    const token = jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as any);

    const { password_hash, ...emp } = employee;
    return res.json({ token, employee: emp, roles, permissions });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/accounts — admin-only: lists all accounts with roles & permissions
router.get('/accounts', authenticate, authorize(ROLES.ADMIN), async (_req: Request, res: Response) => {
  try {
    const rows = await knex('Employee')
      .leftJoin('EmployeeRole', 'Employee.employee_id', 'EmployeeRole.employee_id')
      .leftJoin('Role', 'EmployeeRole.role_id', 'Role.role_id')
      .leftJoin('RolePermission', 'Role.role_id', 'RolePermission.role_id')
      .leftJoin('Permission', 'RolePermission.permission_id', 'Permission.permission_id')
      .select(
        'Employee.employee_id',
        'Employee.employee_name',
        'Employee.department',
        'Employee.position',
        'Employee.anchor_id',
        'Role.role_name',
        'Permission.permission_name'
      )
      .orderBy('Employee.employee_id');

    // Aggregate roles & permissions per employee
    const map = new Map<string, {
      employee_id: string;
      employee_name: string;
      department: string;
      position: string;
      anchor_id?: string;
      roles: Set<string>;
      permissions: Set<string>;
    }>();

    for (const r of rows) {
      const key = r.employee_id;
      if (!map.has(key)) {
        map.set(key, {
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          department: r.department,
          position: r.position,
          anchor_id: r.anchor_id || undefined,
          roles: new Set(),
          permissions: new Set(),
        });
      }
      const entry = map.get(key)!;
      if (r.role_name) entry.roles.add(r.role_name);
      if (r.permission_name) entry.permissions.add(r.permission_name);
    }

    const accounts = Array.from(map.values()).map(a => ({
      employee_id: a.employee_id,
      employee_name: a.employee_name,
      department: a.department,
      position: a.position,
      anchor_id: a.anchor_id || null,
      roles: Array.from(a.roles),
      permissions: Array.from(a.permissions),
    }));

    return res.json({ accounts });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/login-help — public: returns account list for login page (no permissions, no passwords)
router.get('/login-help', async (_req: Request, res: Response) => {
  try {
    const rows = await knex('Employee')
      .leftJoin('EmployeeRole', 'Employee.employee_id', 'EmployeeRole.employee_id')
      .leftJoin('Role', 'EmployeeRole.role_id', 'Role.role_id')
      .select(
        'Employee.employee_id',
        'Employee.employee_name',
        'Employee.department',
        'Employee.position',
        'Role.role_name'
      )
      .orderBy('Employee.employee_id');

    const map = new Map<string, {
      employee_id: string;
      employee_name: string;
      department: string;
      position: string;
      roles: string[];
    }>();

    for (const r of rows) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, {
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          department: r.department,
          position: r.position,
          roles: [],
        });
      }
      if (r.role_name) map.get(r.employee_id)!.roles.push(r.role_name);
    }

    return res.json({ accounts: Array.from(map.values()) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const employee = await knex('Employee').where('employee_id', user.employee_id).first();
    if (!employee) {
      return res.status(404).json({ message: '员工不存在' });
    }

    const empRoles = await knex('EmployeeRole')
      .join('Role', 'EmployeeRole.role_id', 'Role.role_id')
      .where('EmployeeRole.employee_id', user.employee_id)
      .select('Role.role_id', 'Role.role_name');

    const roles = empRoles.map((r: any) => r.role_name);
    const roleIds = empRoles.map((r: any) => r.role_id);

    // Get permissions (same logic as /login)
    const perms = await knex('RolePermission')
      .join('Permission', 'RolePermission.permission_id', 'Permission.permission_id')
      .whereIn('RolePermission.role_id', roleIds)
      .select('Permission.permission_name')
      .distinct();

    const permissions = perms.map((p: any) => p.permission_name);

    const { password_hash, ...emp } = employee;
    return res.json({ employee: emp, roles, permissions });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
