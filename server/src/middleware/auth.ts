import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export const ROLES = {
  MANAGEMENT: '管理层',
  OPERATIONS: '运营人员',
  PURCHASING: '采购人员',
  WAREHOUSE: '仓储人员',
  ANCHOR: '主播',
  ADMIN: '系统管理员',
} as const;

export const ALL_ROLES = Object.values(ROLES);

export interface JwtPayload {
  employee_id: string;
  roles: string[];
  anchor_id?: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  // Support Bearer token from header or token query param (for SSE)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token as string) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ message: '认证令牌无效或已过期' });
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JwtPayload;
    if (!user) {
      return res.status(401).json({ message: '未认证' });
    }
    const hasRole = user.roles.some((r) => roles.includes(r));
    if (!hasRole) {
      return res.status(403).json({ message: '权限不足' });
    }
    next();
  };
}

/**
 * Returns an anchor_id filter for the current user if they are an anchor (主播).
 * Non-anchor users get an empty object (no scoping).
 */
export function getAnchorFilter(req: Request): Record<string, string> {
  const user = (req as any).user as JwtPayload | undefined;
  if (!user) return {};
  if (user.roles.includes('主播') && user.anchor_id) {
    return { anchor_id: user.anchor_id };
  }
  return {};
}

/**
 * Checks if a given anchor_id belongs to the current user.
 * Returns true for non-anchor users (admins/managers have full access).
 */
export function canAccessAnchor(req: Request, anchorId: string): boolean {
  const user = (req as any).user as JwtPayload | undefined;
  if (!user) return false;
  if (!user.roles.includes('主播')) return true; // non-anchors have full access
  return user.anchor_id === anchorId;
}

/**
 * Middleware that requires the :id parameter in the URL to be the user's own anchor_id.
 * Only applies to users with 主播 role.
 */
export function requireOwnAnchor(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as JwtPayload | undefined;
  if (!user) return res.status(401).json({ message: '未认证' });
  if (!user.roles.includes('主播')) return next(); // non-anchors pass through
  const targetId = req.params.id || req.params.anchorId;
  if (targetId && user.anchor_id !== targetId) {
    return res.status(403).json({ message: '无权访问其他主播的数据' });
  }
  return next();
}
