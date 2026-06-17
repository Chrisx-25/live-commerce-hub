import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../pages/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('../pages/DashboardPage.vue'),
      meta: { title: '数据总览', permission: '看板查看' },
    },
    {
      path: '/monitor',
      name: 'Monitor',
      component: () => import('../pages/MonitorPage.vue'),
      meta: { title: '直播监控', permission: '直播监控' },
    },
    {
      path: '/products',
      name: 'Products',
      component: () => import('../pages/ProductsPage.vue'),
      meta: { title: '商品管理', permission: '商品管理' },
    },
    {
      path: '/anchors',
      name: 'Anchors',
      component: () => import('../pages/AnchorsPage.vue'),
      meta: { title: '主播管理', permission: '主播管理' },
    },
    {
      path: '/purchasing',
      name: 'Purchasing',
      component: () => import('../pages/PurchasingPage.vue'),
      meta: { title: '采购管理', permission: '采购管理' },
    },
    {
      path: '/inventory',
      name: 'Inventory',
      component: () => import('../pages/InventoryPage.vue'),
      meta: { title: '库存管理', permission: '库存管理' },
    },
    {
      path: '/scripts',
      name: 'Scripts',
      component: () => import('../pages/ScriptsPage.vue'),
      meta: { title: '脚本管理', permission: '脚本管理' },
    },
    {
      path: '/selection',
      name: 'Selection',
      component: () => import('../pages/SelectionPage.vue'),
      meta: { title: '选品分析', permission: '选品分析' },
    },
    {
      path: '/anchor-product-planning',
      alias: '/live-planning',
      name: 'AnchorProductPlanning',
      component: () => import('../pages/AnchorProductPlanningPage.vue'),
      meta: { title: '场次安排', permission: '直播场次管理' },
    },
    {
      path: '/reports',
      name: 'Reports',
      component: () => import('../pages/ReportsPage.vue'),
      meta: { title: '运营报告', permission: '报告查看' },
    },
    {
      path: '/live-reviews',
      name: 'LiveReviews',
      component: () => import('../pages/LiveReviewPage.vue'),
      meta: { title: '直播复盘', permission: '数据分析' },
    },
    {
      path: '/after-sales',
      name: 'AfterSales',
      component: () => import('../pages/AfterSalePage.vue'),
      meta: { title: '售后工单', permission: '售后管理' },
    },
    {
      path: '/live-sessions',
      name: 'LiveSessions',
      component: () => import('../pages/LiveSessionsPage.vue'),
      meta: { title: '直播场次', permission: '直播场次管理' },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  // Allow guest pages (login)
  if (to.meta.guest) {
    next()
    return
  }
  // Must be logged in
  if (!auth.token) {
    next('/login')
    return
  }
  // On fresh page load / refresh, default to Dashboard
  if (!auth.initialized) {
    if (to.path === '/dashboard') {
      next() // allow dashboard to render while fetching user info
    } else {
      next('/dashboard') // redirect any other route to dashboard
    }
    return
  }
  // Check route-level permission
  const required = to.meta.permission as string | undefined
  if (required && !auth.permissions.includes(required)) {
    next('/dashboard') // fallback — dashboard is available to all roles
    return
  }
  next()
})

export default router
