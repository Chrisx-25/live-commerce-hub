import { Request, Response, NextFunction } from 'express';
import { sanitizeErrorMessage } from '../utils/sanitizeError';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err.message);
  const message = sanitizeErrorMessage(err.message);
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    message: isDev ? message : '服务内部错误，请稍后重试。',
  });
}
