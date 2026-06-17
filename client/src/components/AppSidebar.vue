<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Headphones,
  LayoutDashboard,
  LogOut,
  Package,
  Target,
  Truck,
  Users,
  Video,
  Warehouse,
} from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
type MenuItem = {
  path: string
  label: string
  icon: Component
}

const menuItems = computed<MenuItem[]>(() => {
  const allItems: MenuItem[] = [
    // 运营工作台 — 直播业务核心管线
    { path: '/dashboard', label: '数据总览', icon: LayoutDashboard },
    { path: '/live-sessions', label: '直播场次', icon: Video },
    { path: '/anchor-product-planning', label: '场次安排', icon: CalendarCheck },
    { path: '/selection', label: '选品分析', icon: Target },
    { path: '/live-reviews', label: '直播复盘', icon: ClipboardCheck },
    // 业务资料 — 基础主数据
    { path: '/products', label: '商品管理', icon: Package },
    { path: '/anchors', label: '主播管理', icon: Users },
    { path: '/scripts', label: '脚本管理', icon: FileText },
    // 履约与复盘 — 供应链 + 售后 + 分析
    { path: '/purchasing', label: '采购管理', icon: Truck },
    { path: '/inventory', label: '库存管理', icon: Warehouse },
    { path: '/after-sales', label: '售后工单', icon: Headphones },
    { path: '/reports', label: '运营报告', icon: BarChart3 },
  ]
  // Filter by route-level permission (synced with permission matrix)
  return allItems.filter(item => {
    const routeForItem = router.resolve(item.path)
    const perm = routeForItem?.meta?.permission as string | undefined
    if (!perm) return true // no permission required → show
    return auth.permissions.includes(perm)
  })
})

const menuGroups = computed(() => [
  { title: '运营工作台', items: menuItems.value.filter(item => ['/dashboard', '/live-sessions', '/anchor-product-planning', '/selection', '/live-reviews'].includes(item.path)) },
  { title: '业务资料', items: menuItems.value.filter(item => ['/products', '/anchors', '/scripts'].includes(item.path)) },
  { title: '履约与复盘', items: menuItems.value.filter(item => ['/purchasing', '/inventory', '/after-sales', '/reports'].includes(item.path)) },
].filter(group => group.items.length))

function navigate(path: string) {
  router.push(path)
}

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/')
}

function logout() {
  auth.logout()
  router.push('/login')
}

const roleLabels: Record<string, string> = {
  '管理层': '管理层',
  '运营人员': '运营',
  '采购人员': '采购',
  '仓储人员': '仓储',
  '主播': '主播',
  '系统管理员': '管理员',
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-mark">LC</div>
      <div>
        直播电商中台
        <span>LIVE COMMERCE HUB</span>
      </div>
    </div>
    <nav class="sidebar-nav" aria-label="主导航">
      <section v-for="group in menuGroups" :key="group.title" class="nav-group">
        <div class="nav-group-title">{{ group.title }}</div>
        <button
          v-for="item in group.items"
          :key="item.path"
          type="button"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          @click="navigate(item.path)"
        >
          <component :is="item.icon" :size="17" stroke-width="1.9" class="nav-icon" />
          <span>{{ item.label }}</span>
        </button>
      </section>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="avatar">
          {{ auth.employee?.employee_name?.charAt(0) || 'U' }}
        </div>
        <div class="user-meta">
          <div class="user-name">{{ auth.employee?.employee_name || '用户' }}</div>
          <div class="user-role">{{ roleLabels[auth.userRole] || auth.userRole }}</div>
        </div>
      </div>
      <div class="footer-actions">
        <button class="icon-btn" type="button" title="退出登录" @click="logout">
          <LogOut :size="15" />
          <span>退出</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: var(--sidebar-width);
  background: var(--paper);
  border-right: 1px solid var(--rule);
  display: flex; flex-direction: column;
  z-index: 100; overflow-y: auto;
}
.sidebar-brand {
  padding: 22px 18px 18px;
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 12px;
  align-items: center;
  font-family: var(--font-serif);
  font-size: 18px; font-weight: 900;
  line-height: 1.25;
  color: var(--ink);
  border-bottom: 1px solid var(--rule);
}
.brand-mark {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
}
.sidebar-brand span {
  display: block;
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 400;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  margin-top: 3px;
}
.sidebar-nav { flex: 1; padding: 14px 10px; }
.nav-group + .nav-group { margin-top: 12px; }
.nav-group-title {
  padding: 4px 10px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
}
.nav-item {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 14px; font-weight: 500;
  color: var(--ink-mid); text-decoration: none;
  transition: all var(--duration-fast) ease;
  cursor: pointer;
  text-align: left;
}
.nav-item:hover { background: var(--paper-dark); color: var(--ink); }
.nav-item.active {
  color: var(--ink);
  border-color: rgba(196, 30, 58, 0.25);
  background: var(--vermillion-soft);
  box-shadow: inset 3px 0 0 var(--vermillion);
}
.nav-icon { flex-shrink: 0; color: currentColor; }
.sidebar-footer {
  padding: 14px 16px 16px; border-top: 1px solid var(--rule);
  display: grid; gap: 12px;
  font-size: 13px; color: var(--ink-soft);
}
.user-row {
  display: flex; align-items: center; gap: 10px;
}
.avatar {
  width: 34px; height: 34px; border-radius: 2px;
  background: var(--ink); color: var(--paper);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  flex-shrink: 0;
}
.user-meta { min-width: 0; }
.user-name {
  font-weight: 700;
  color: var(--ink);
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.user-role { font-size: 11px; }
.footer-actions {
  display: grid;
  gap: 8px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}
.icon-btn:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.icon-btn:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
