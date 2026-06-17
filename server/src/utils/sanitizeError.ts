/**
 * Sanitize technical error messages for user-facing responses.
 * Detects SQL errors, stack traces, file paths, and other
 * source-code-level content; replaces with readable Chinese text.
 */

const SQL_MARKERS = [
  'insert into', 'update ', 'delete from', 'create table',
  'violation of', 'constraint', 'cannot insert',
  'foreign key', 'primary key', 'unique key',
  'duplicate key', 'incorrect syntax', 'invalid column',
  'invalid object', 'could not', 'data too long', 'truncation',
  'mssql', 'sqlerror', 'syntax error',
  'identifier ', 'exceeded', 'reference constraint',
  'conflicted with', 'the conflict occurred',
];

const STACK_MARKERS = [
  '\n    at ', 'node:', 'node_modules',
  'Error:', 'TypeError:', 'ReferenceError:', 'SyntaxError:',
  '.ts:', '.js:', '.vue:',
  '/src/', '/dist/',
  'exports.', 'require (', 'Module.',
];

const FILE_PATH_PATTERN = /[A-Z]:[\\/]\S+/i;

export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') return '操作失败，请稍后重试。';

  const lower = message.toLowerCase();

  // SQL / database errors → generic operation error
  if (SQL_MARKERS.some((m) => lower.includes(m))) {
    return '数据操作异常，请稍后重试或联系管理员。';
  }

  // Stack traces or file paths → generic system error
  if (STACK_MARKERS.some((m) => lower.includes(m)) || FILE_PATH_PATTERN.test(message)) {
    return '系统内部错误，请稍后重试。';
  }

  // Connection / network errors
  if (
    lower.includes('connect econnrefused') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('eaddrinuse') ||
    lower.includes('socket hang up')
  ) {
    return '服务连接异常，请检查网络后重试。';
  }

  // Timeout
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return '请求超时，请稍后重试。';
  }

  // English-only error messages (non-Chinese) that look technical
  if (/^[a-zA-Z\s.,!?'"()\[\]{}:;@#$%^&*+=<>/\\|-]+$/.test(message.trim()) && message.length > 30) {
    return '系统内部错误，请稍后重试。';
  }

  return message;
}
