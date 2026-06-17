import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return '操作失败，请稍后重试。';
  const lower = msg.toLowerCase();

  // SQL / database errors
  const sqlMarkers = [
    'insert into', 'update ', 'delete from', 'create table',
    'violation of', 'constraint', 'cannot insert',
    'foreign key', 'primary key', 'unique key',
    'duplicate key', 'incorrect syntax', 'invalid column',
    'invalid object', 'could not', 'data too long', 'truncation',
    'mssql', 'sqlerror', 'syntax error',
  ];
  if (sqlMarkers.some((m) => lower.includes(m))) {
    return '数据操作异常，请稍后重试或联系管理员。';
  }

  // Stack traces / file paths
  const techMarkers = [
    '\n    at ', 'node:', 'node_modules',
    'Error:', 'TypeError:', 'ReferenceError:', 'SyntaxError:',
    '.ts:', '.js:', '.vue:',
  ];
  if (techMarkers.some((m) => lower.includes(m)) || /[A-Z]:[\\/]\S+/i.test(msg)) {
    return '系统内部错误，请稍后重试。';
  }

  // Connection errors
  if (
    lower.includes('connect econnrefused') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('network error')
  ) {
    return '服务连接异常，请检查网络后重试。';
  }

  // Timeout
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return '请求超时，请稍后重试。';
  }

  // Long English-only messages (likely technical)
  if (/^[a-zA-Z\s.,!?'"()\[\]{}:;@#$%^&*+=<>/\\|-]+$/.test(msg.trim()) && msg.length > 30) {
    return '系统内部错误，请稍后重试。';
  }

  return msg;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const auth = useAuthStore()
      auth.logout()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // Sanitize technical messages in response body
    const data = error.response?.data;
    if (data && typeof data === 'object') {
      if (typeof data.message === 'string') {
        error.response.data = { ...data, message: sanitizeErrorMessage(data.message) };
      }
      if (typeof data.error === 'string') {
        error.response.data = { ...error.response.data, error: sanitizeErrorMessage(data.error) };
      }
    }
    // Also sanitize the raw JS Error.message (used as fallback in some pages)
    if (error.message && typeof error.message === 'string') {
      error.message = sanitizeErrorMessage(error.message);
    }
    return Promise.reject(error)
  }
)

export default api

// Auth API
export const authAPI = {
  login: (employeeId: string, password: string) =>
    api.post('/auth/login', { employee_id: employeeId, password }),
  me: () => api.get('/auth/me'),
}

// Products API
export const productsAPI = {
  list: (params?: any) => api.get('/products', { params }),
  get: (id: string) => api.get(`/products/${id}`),
  skus: (id: string) => api.get(`/products/${id}/skus`),
  create: (data: any) => api.post('/products', data),
  update: (id: string, data: any) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
}

// Anchors API
export const anchorsAPI = {
  list: (params?: any) => api.get('/anchors', { params }),
  get: (id: string) => api.get(`/anchors/${id}`),
  create: (data: any) => api.post('/anchors', data),
  update: (id: string, data: any) => api.put(`/anchors/${id}`, data),
  delete: (id: string) => api.delete(`/anchors/${id}`),
}

// Suppliers API
export const suppliersAPI = {
  list: (params?: any) => api.get('/suppliers', { params }),
  get: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: any) => api.post('/suppliers', data),
  update: (id: string, data: any) => api.put(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
}

// Inventory API
export const inventoryAPI = {
  list: (params?: any) => api.get('/inventory', { params }),
  alerts: (params?: any) => api.get('/inventory/alerts', { params }),
  update: (id: string, data: any) => api.put(`/inventory/${id}`, data),
  batchPurchase: () => api.post('/inventory/batch-purchase'),
}

// Purchases API
export const purchasesAPI = {
  list: (params?: any) => api.get('/purchases', { params }),
  get: (id: string) => api.get(`/purchases/${id}`),
  create: (data: any) => api.post('/purchases', data),
  createNewProduct: (data: any) => api.post('/purchases/new-product', data),
  updateStatus: (id: string, status: string) => api.put(`/purchases/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/purchases/${id}`),
  suggestions: (params?: any) => api.get('/purchase-suggestions', { params }),
}

// Live Sessions API
export const liveSessionsAPI = {
  list: (params?: any) => api.get('/live-sessions', { params }),
  get: (id: string) => api.get(`/live-sessions/${id}`),
  create: (data: any) => api.post('/live-sessions', data),
  update: (id: string, data: any) => api.put(`/live-sessions/${id}`, data),
  startSimulate: (id: string, data?: any) => api.post(`/live-sessions/${id}/simulate/start`, data),
  stopSimulate: (id: string) => api.post(`/live-sessions/${id}/simulate/stop`),
  getStreamUrl: (id: string) => `/api/live-sessions/stream/${id}`,
}

// Live Review API
export const liveReviewsAPI = {
  list: () => api.get('/live-reviews'),
  generate: (liveId: string) => api.post(`/live-reviews/generate/${liveId}`),
  get: (id: string) => api.get(`/live-reviews/${id}`),
  products: (id: string) => api.get(`/live-reviews/${id}/products`),
  anchor: (id: string) => api.get(`/live-reviews/${id}/anchor`),
}

// Anchor Product Planning API
export const anchorProductPlanningAPI = {
  fits: (params?: any) => api.get('/anchor-product-planning/fits', { params }),
  generateForProduct: (productId: string, data?: any) => api.post(`/anchor-product-planning/fits/product/${productId}`, data),
  generateForAnchor: (anchorId: string, data?: any) => api.post(`/anchor-product-planning/fits/anchor/${anchorId}`, data),
  createPlan: (liveId: string, data?: any) => api.post(`/anchor-product-planning/plans/${liveId}`, data),
  updatePlan: (id: string, data: any) => api.put(`/anchor-product-planning/plans/${id}`, data),
  confirmPlan: (id: string) => api.post(`/anchor-product-planning/plans/${id}/confirm`),
  getPlan: (id: string) => api.get(`/anchor-product-planning/plans/${id}`),
}

// Scripts API
export const scriptsAPI = {
  list: (params?: any) => api.get('/scripts', { params }),
  get: (id: string) => api.get(`/scripts/${id}`),
  create: (data: any) => api.post('/scripts', data),
  generate: (data: any) => api.post('/scripts/generate', data),
  update: (id: string, data: any) => api.put(`/scripts/${id}`, data),
  delete: (id: string) => api.delete(`/scripts/${id}`),
}

// Orders API
export const ordersAPI = {
  list: (params?: any) => api.get('/orders', { params }),
}

// Interactions API
export const interactionsAPI = {
  list: (params?: any) => api.get('/interactions', { params }),
}

// Dashboard API
export interface DashboardParams {
  days?: number
  startDate?: string
  endDate?: string
}
export const dashboardAPI = {
  summary: (params?: DashboardParams) => api.get('/dashboard/summary', { params }),
  trend: (params?: DashboardParams) => api.get('/dashboard/trend', { params }),
  topAnchors: (limit?: number, params?: DashboardParams) => api.get('/dashboard/top-anchors', { params: { limit, ...params } }),
  categoryGmv: (params?: DashboardParams) => api.get('/dashboard/category-gmv', { params }),
  topProducts: (limit?: number, params?: DashboardParams) => api.get('/dashboard/top-products', { params: { limit, ...params } }),
}

// Selection API
export const selectionAPI = {
  rankings: (params?: any) => api.get('/selection/rankings', { params }),
  recommendations: (productId: string) => api.get(`/selection/recommendations/${productId}`),
  trends: () => api.get('/selection/trends'),
  advisorReport: () => api.get('/selection/advisor-report'),
  coldstart: (productId: string) => api.post(`/selection/coldstart/${productId}`),
}

// Anchor Performance API
export const anchorPerfAPI = {
  list: (params?: any) => api.get('/anchor-performance', { params }),
  radar: (id: string) => api.get(`/anchor-performance/${id}/radar`),
}

// After Sales API
export const afterSalesAPI = {
  list: (params?: any) => api.get('/after-sales', { params }),
  update: (id: string, data: any) => api.put(`/after-sales/${id}`, data),
}

// Reports API
export const reportsAPI = {
  list: (params?: any) => api.get('/reports', { params }),
  get: (id: string) => api.get(`/reports/${id}`),
}

// Interface Logs API
export const interfaceLogsAPI = {
  list: (params?: any) => api.get('/interface-logs', { params }),
}
