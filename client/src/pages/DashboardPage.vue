<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js'
import { dashboardAPI } from '../api'
import type { DashboardParams } from '../api'
import type { DashboardSummary } from '../types'
import PageHeader from '../components/PageHeader.vue'
import KpiCard from '../components/KpiCard.vue'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Filler, Legend)

const router = useRouter()
const summary = ref<DashboardSummary | null>(null)
const trend = ref<any[]>([])
const topAnchors = ref<any[]>([])
const categoryGmv = ref<any[]>([])
const topProducts = ref<any[]>([])
const loading = ref(true)

// --- Period state ---
const periodMode = ref<'preset' | 'custom'>('preset')
const dashboardDays = ref(30)
const customStart = ref('')
const customEnd = ref('')
const appliedStart = ref('')
const appliedEnd = ref('')

const presetOptions = [
  { label: '7天', value: 7 },
  { label: '14天', value: 14 },
  { label: '30天', value: 30 },
  { label: '60天', value: 60 },
  { label: '90天', value: 90 },
]

function initCustomDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  customEnd.value = end.toISOString().split('T')[0]
  customStart.value = start.toISOString().split('T')[0]
}

const currentParams = computed<DashboardParams>(() => {
  if (periodMode.value === 'custom' && appliedStart.value && appliedEnd.value) {
    return { startDate: appliedStart.value, endDate: appliedEnd.value }
  }
  return { days: dashboardDays.value }
})

async function loadDashboard() {
  loading.value = true
  try {
    const params = currentParams.value
    const [s, t, a, c, p] = await Promise.all([
      dashboardAPI.summary(params),
      dashboardAPI.trend(params),
      dashboardAPI.topAnchors(5, params),
      dashboardAPI.categoryGmv(params),
      dashboardAPI.topProducts(10, params),
    ])
    summary.value = s.data
    trend.value = t.data
    topAnchors.value = a.data
    categoryGmv.value = c.data
    topProducts.value = p.data
  } catch (e) {
    console.error('Failed to load dashboard:', e)
  } finally {
    loading.value = false
  }
}

function selectPreset(days: number) {
  dashboardDays.value = days
}

function applyCustomRange() {
  if (!customStart.value || !customEnd.value) return
  if (customStart.value > customEnd.value) {
    const tmp = customStart.value
    customStart.value = customEnd.value
    customEnd.value = tmp
  }
  appliedStart.value = customStart.value
  appliedEnd.value = customEnd.value
  loadDashboard()
}

watch([dashboardDays, appliedStart, appliedEnd], () => {
  loadDashboard()
})

function switchMode(mode: 'preset' | 'custom') {
  periodMode.value = mode
  if (mode === 'custom' && !customStart.value) {
    initCustomDates()
  }
  if (mode === 'preset') {
    loadDashboard()
  } else if (mode === 'custom' && appliedStart.value) {
    loadDashboard()
  }
}

onMounted(() => {
  initCustomDates()
  loadDashboard()
})

function formatCurrency(v: number) {
  if (v >= 10000) return '¥' + (v / 10000).toFixed(1) + '万'
  return '¥' + v.toLocaleString()
}

function formatNumber(v: number) {
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  if (Number.isInteger(v)) return v.toLocaleString()
  return v.toFixed(1)
}

// ====== Trend chart ======
const chartData = computed(() => ({
  labels: trend.value.map((t: any) => {
    const d = new Date(t.date)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }),
  datasets: [
    {
      label: 'GMV',
      data: trend.value.map((t: any) => t.gmv),
      borderColor: '#C41E3A',
      backgroundColor: 'rgba(196, 30, 58, 0.06)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
      pointBackgroundColor: '#C41E3A',
      borderWidth: 2,
      yAxisID: 'y',
    },
    {
      label: '订单数',
      data: trend.value.map((t: any) => t.orders),
      borderColor: '#3A3A3A',
      backgroundColor: 'rgba(58, 58, 58, 0.04)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
      pointBackgroundColor: '#3A3A3A',
      borderWidth: 1.5,
      borderDash: [4, 3],
      yAxisID: 'y1',
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        boxWidth: 10, boxHeight: 3, padding: 16,
        font: { family: "'Noto Sans SC', sans-serif", size: 11 },
        color: '#3A3A3A',
      },
    },
    tooltip: {
      backgroundColor: '#111111',
      titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
      bodyFont: { family: "'Noto Sans SC', sans-serif", size: 12 },
      padding: 10, cornerRadius: 2,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 10 }, color: '#6A6A64', maxTicksLimit: 14 },
    },
    y: {
      type: 'linear' as const, position: 'left' as const,
      grid: { color: '#DDD8C7' },
      ticks: {
        font: { family: "'JetBrains Mono', monospace", size: 10 }, color: '#6A6A64',
        callback: (v: any) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v,
      },
      beginAtZero: true,
    },
    y1: {
      type: 'linear' as const, position: 'right' as const,
      grid: { drawOnChartArea: false },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 10 }, color: '#6A6A64' },
      beginAtZero: true,
    },
  },
}))

// ====== Category GMV donut ======
const CATEGORY_COLORS = [
  '#C41E3A', '#3A3A3A', '#B58940', '#2D6A4F', '#2C5F8A',
  '#B85C1A', '#6A6A64', '#8B6F47', '#4A7C59', '#7C3A5C',
  '#A0522D', '#556B2F',
]

const categoryTotalGmv = computed(() => categoryGmv.value.reduce((s: number, c: any) => s + c.gmv, 0))

const categoryChartData = computed(() => {
  if (!categoryGmv.value.length) return { labels: [], datasets: [] }
  return {
    labels: categoryGmv.value.map((c: any) => c.category),
    datasets: [{
      data: categoryGmv.value.map((c: any) => c.gmv),
      backgroundColor: categoryGmv.value.map((_: any, i: number) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
      borderColor: 'var(--paper)',
      borderWidth: 2,
      hoverBorderColor: 'var(--ink)',
    }],
  }
})

const categoryChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '55%',
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        boxWidth: 8, boxHeight: 8, padding: 5,
        font: { family: "'Noto Sans SC', sans-serif", size: 10 },
        color: '#3A3A3A',
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: '#111111',
      titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
      bodyFont: { family: "'Noto Sans SC', sans-serif", size: 12 },
      padding: 10, cornerRadius: 2,
      callbacks: {
        label: (ctx: any) => {
          const pct = categoryTotalGmv.value ? ((ctx.raw / categoryTotalGmv.value) * 100).toFixed(1) : '0'
          return ` ${ctx.label}: ¥${(ctx.raw / 10000).toFixed(1)}万 (${pct}%)`
        },
      },
    },
  },
}))

// ====== TOP10 products ======
const topProductMax = computed(() => Math.max(...topProducts.value.map((p: any) => p.gmv || 0), 1))

// ====== TOP5 anchors ======
const topAnchorMax = computed(() => Math.max(...topAnchors.value.map((a: any) => Number(a.total_gmv || 0)), 1))

function getLevelClass(level: string) {
  return `level-${level}`
}

const periodText = computed(() => {
  if (!summary.value?.period) return '—'
  return `${summary.value.period.startDate} 至 ${summary.value.period.endDate}`
})

const isAnchorScope = computed(() => summary.value?.scope?.type === 'anchor')
const scopeAnchorName = computed(() => summary.value?.scope?.anchorName || '')

const remindSent = ref(false)

function goInventory() {
  if (isAnchorScope.value) {
    remindSent.value = true
    setTimeout(() => { remindSent.value = false }, 2500)
    return
  }
  router.push('/inventory')
}

const canApplyCustom = computed(() => customStart.value && customEnd.value)
</script>

<template>
  <PageHeader title="运营数据总览" subtitle="直播电商业务全景" />
  <div class="page-body">
    <!-- Anchor identity banner -->
    <div class="anchor-banner" v-if="isAnchorScope">
      <span class="anchor-badge">主播专属</span>
      <span class="anchor-banner-name">{{ scopeAnchorName }}</span>
      <span class="anchor-banner-desc">以下数据为您的个人直播运营数据，TOP5 主播排名为全公司范围</span>
    </div>

    <!-- Period Selector -->
    <div class="period-bar" v-if="summary">
      <div class="period-mode-row">
        <button class="mode-toggle" :class="{ active: periodMode === 'preset' }" @click="switchMode('preset')">快捷周期</button>
        <button class="mode-toggle" :class="{ active: periodMode === 'custom' }" @click="switchMode('custom')">自定义</button>
        <div class="preset-chips" v-if="periodMode === 'preset'">
          <button v-for="opt in presetOptions" :key="opt.value" class="period-chip" :class="{ active: dashboardDays === opt.value }" @click="selectPreset(opt.value)">{{ opt.label }}</button>
        </div>
        <div class="custom-dates" v-if="periodMode === 'custom'">
          <input type="date" class="date-input" v-model="customStart" :max="customEnd || undefined" />
          <span class="date-sep">至</span>
          <input type="date" class="date-input" v-model="customEnd" :min="customStart || undefined" />
          <button class="btn small primary" :disabled="!canApplyCustom" @click="applyCustomRange">应用</button>
        </div>
        <span class="period-range-text">统计周期：{{ periodText }}</span>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div class="kpi-row" v-if="loading && !summary">
      <div class="kpi-card skeleton" v-for="i in 4" :key="i">
        <div class="skel-line w-24"></div>
        <div class="skel-line w-32 h-10"></div>
        <div class="skel-line w-20 mt-2"></div>
      </div>
    </div>

    <!-- KPI Row -->
    <div class="kpi-row" v-if="summary">
      <KpiCard label="GMV 总销售额" :value="formatCurrency(summary.totalGmv)" :sub-value="'日均 ' + formatCurrency(summary.dailyAvgGmv)" :change="`${summary.gmvChange > 0 ? '+' : ''}${summary.gmvChange}% 环比`" :change-type="summary.gmvChange >= 0 ? 'up' : 'down'" />
      <KpiCard label="总订单数" :value="formatNumber(summary.totalOrders)" :sub-value="'日均 ' + formatNumber(summary.dailyAvgOrders) + ' 单'" :change="`${summary.ordersChange > 0 ? '+' : ''}${summary.ordersChange}% 环比`" :change-type="summary.ordersChange >= 0 ? 'up' : 'down'" />
      <KpiCard label="平均转化率" :value="summary.avgConversionRate?.toFixed(1) + '%'" :change="`${summary.conversionChange > 0 ? '+' : ''}${summary.conversionChange}% 环比`" :change-type="summary.conversionChange >= 0 ? 'up' : 'down'" />
      <div class="kpi-card-wrap">
        <KpiCard :label="isAnchorScope ? '直播商品库存告警' : '库存告警 SKU'" :value="summary.stockAlertCount" :change="isAnchorScope ? '即将直播商品' : '需及时补货'" change-type="neutral" />
        <button
          class="btn small kpi-card-btn"
          :class="remindSent ? 'success' : 'primary'"
          @click="goInventory"
        >
          <template v-if="isAnchorScope">
            {{ remindSent ? '✓ 已提醒' : '提醒补货' }}
          </template>
          <template v-else>查看库存 →</template>
        </button>
      </div>
    </div>

    <!-- Charts Row 1: Sales Trend + Category GMV Donut -->
    <div class="charts-row">
      <div class="card">
        <div class="card-header">
          <span class="card-title">销售趋势</span>
          <span class="card-extra">GMV / 订单数</span>
        </div>
        <div class="card-divider"></div>
        <div class="card-body">
          <div class="chart-wrap" v-if="trend.length">
            <Line :data="chartData" :options="chartOptions" />
          </div>
          <div v-else class="empty-hint">暂无趋势数据</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">品类 GMV 占比</span>
          <span class="card-extra">{{ categoryGmv.length }} 个品类</span>
        </div>
        <div class="card-divider"></div>
        <div class="card-body">
          <div class="donut-wrap" v-if="categoryGmv.length">
            <Doughnut :data="categoryChartData" :options="categoryChartOptions" />
          </div>
          <div v-else class="empty-hint">暂无品类数据</div>
        </div>
      </div>
    </div>

    <!-- Charts Row 2: TOP10 Products + TOP5 Anchors -->
    <div class="rankings-row">
      <div class="card">
        <div class="card-header">
          <span class="card-title">商品排行 TOP10</span>
          <span class="card-extra">GMV 贡献</span>
        </div>
        <div class="card-divider"></div>
        <div class="card-body">
          <div v-if="topProducts.length" class="product-list">
            <div class="product-item" v-for="(p, idx) in topProducts" :key="p.productId">
              <span class="product-rank" :class="{ t1: idx === 0, t2: idx === 1, t3: idx === 2 }">{{ idx + 1 }}</span>
              <div class="product-info">
                <div class="product-name-row">
                  <span class="product-name">{{ p.productName }}</span>
                  <span class="product-gmv">{{ formatCurrency(p.gmv) }}</span>
                </div>
                <div class="product-meta">
                  <span class="cat-tag">{{ p.category }}</span>
                  <span class="qty-text">{{ p.quantity }} 件</span>
                </div>
                <div class="product-track">
                  <i :style="{ width: `${Math.max(4, p.gmv / topProductMax * 100)}%` }"></i>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">暂无商品数据</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">主播排名 TOP5 <span v-if="isAnchorScope" class="scope-tag">全公司</span></span>
          <span class="card-extra">GMV 贡献</span>
        </div>
        <div class="card-divider"></div>
        <div class="card-body">
          <div v-if="topAnchors.length">
            <div class="anchor-item ranked-anchor" v-for="(a, idx) in topAnchors" :key="a.anchor_id">
              <span class="anchor-rank" :class="{ t1: idx === 0 }">{{ idx + 1 }}</span>
              <div class="anchor-avatar">{{ a.anchor_name?.charAt(0) }}</div>
              <div class="anchor-info">
                <div class="anchor-name-row">
                  <div class="anchor-name">{{ a.anchor_name }}</div>
                  <div class="anchor-gmv">{{ formatCurrency(a.total_gmv || 0) }}</div>
                </div>
                <div class="anchor-meta">
                  <span :class="getLevelClass(a.anchor_level)">{{ a.anchor_level }}</span>
                  {{ a.specialization }}
                </div>
                <div class="rank-track">
                  <i :style="{ width: `${Math.max(8, Number(a.total_gmv || 0) / topAnchorMax * 100)}%` }"></i>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">暂无数据</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== Density-first dashboard — fits on one screen @ 1080p ===== */

/* ----- Page-header compaction (override global) ----- */
:deep(.page-header) { padding: 20px 48px 0; }
:deep(.page-title) { font-size: 28px; }
:deep(.page-subtitle) { font-size: 12px; margin-top: 3px; }
:deep(.page-divider) { margin-top: 12px; margin-bottom: 16px; }

/* override page-body bottom padding */
.page-body { padding-bottom: 20px; }

/* ----- Anchor identity banner (compact) ----- */
.anchor-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px; margin-bottom: 12px;
  background: linear-gradient(135deg, rgba(188, 125, 43, 0.08) 0%, rgba(188, 125, 43, 0.03) 100%);
  border: 1px solid rgba(188, 125, 43, 0.25);
  border-left: 3px solid var(--gold);
  font-size: 12px;
}
.anchor-badge { display: inline-block; padding: 2px 8px; background: var(--gold); color: #fff; font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; }
.anchor-banner-name { font-weight: 700; color: var(--ink); font-size: 13px; }
.anchor-banner-desc { color: var(--ink-soft); font-size: 11px; margin-left: auto; }
.scope-tag { display: inline-block; padding: 1px 6px; background: var(--paper-dark); border: 1px solid var(--rule); font-family: var(--font-mono); font-size: 9px; font-weight: 500; color: var(--ink-soft); vertical-align: middle; margin-left: 4px; }

/* ----- Period Selector (compact) ----- */
.period-bar { margin-bottom: 10px; }
.period-mode-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mode-toggle { padding: 3px 0 2px; border: none; border-bottom: 2px solid transparent; background: none; font-family: var(--font-sans); font-size: 12px; font-weight: 500; color: var(--ink-soft); cursor: pointer; transition: all var(--duration-fast); }
.mode-toggle:hover { color: var(--ink); }
.mode-toggle.active { color: var(--ink); border-bottom-color: var(--vermillion); font-weight: 600; }
.preset-chips { display: flex; gap: 0; border: 1px solid var(--rule); overflow: hidden; }
.period-chip { padding: 4px 14px; border: none; border-right: 1px solid var(--rule); background: var(--paper); font-family: var(--font-mono); font-size: 11px; color: var(--ink); cursor: pointer; transition: all var(--duration-fast); }
.period-chip:last-child { border-right: none; }
.period-chip:hover { background: var(--paper-dark); }
.period-chip.active { background: var(--vermillion-soft); color: var(--vermillion); font-weight: 600; }
.custom-dates { display: flex; align-items: center; gap: 8px; }
.date-input { padding: 4px 8px; border: 1px solid var(--rule); background: var(--paper); font-family: var(--font-mono); font-size: 11px; color: var(--ink); width: 134px; transition: border-color var(--duration-fast); }
.date-input:focus { outline: none; border-color: var(--vermillion); }
.date-input::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
.date-sep { font-size: 12px; color: var(--ink-soft); }
.period-range-text { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); white-space: nowrap; }

/* ----- KPI cards (compact) ----- */
.kpi-row { gap: 14px; margin-bottom: 14px; }
.kpi-row :deep(.kpi-card) { padding: 14px 18px 14px; }
.kpi-row :deep(.kpi-label) { font-size: 10px; margin-bottom: 4px; letter-spacing: 0.06em; }
.kpi-row :deep(.kpi-value) { font-size: 30px; }
.kpi-row :deep(.kpi-sub) { font-size: 11px; margin-top: 2px; }
.kpi-row :deep(.kpi-change) { font-size: 10px; margin-top: 3px; }
.kpi-card-wrap { position: relative; height: 100%; }
.kpi-card-wrap :deep(.kpi-card) { height: 100%; }
.kpi-card-btn { position: absolute; bottom: 8px; right: 12px; font-size: 10px; transition: all var(--duration-fast); }
.kpi-card-btn.success { background: var(--sage); color: #fff; border-color: var(--sage); pointer-events: none; }

/* ----- Charts layout (compact) ----- */
.charts-row { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; margin-bottom: 14px; }
.charts-row .card-body { padding: 10px 20px 14px; }
.rankings-row { display: grid; grid-template-columns: 7fr 4fr; gap: 14px; margin-bottom: 0; }
.rankings-row .card-body { padding: 8px 20px 14px; }

/* ----- Skeleton ----- */
.skeleton { animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.skel-line { height: 14px; background: var(--rule-soft); border-radius: 2px; }
.skel-line.w-24 { width: 60%; }
.skel-line.w-32 { width: 80%; }
.skel-line.w-20 { width: 50%; }
.skel-line.h-10 { height: 38px; margin: 8px 0; }
.skel-line.mt-2 { margin-top: 8px; }

/* ----- Charts ----- */
.chart-wrap { width: 100%; height: 185px; position: relative; }
.chart-wrap canvas { width: 100% !important; height: 100% !important; }
.donut-wrap { width: 100%; height: 185px; position: relative; display: flex; justify-content: center; }
.donut-wrap canvas { max-width: 100% !important; max-height: 100% !important; }
.empty-hint { padding: 28px 20px; text-align: center; color: var(--ink-soft); font-size: 12px; }

/* ----- TOP10 Products (compact) ----- */
.product-list { display: flex; flex-direction: column; }
.product-item { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--rule-soft); }
.product-item:last-child { border-bottom: none; padding-bottom: 0; }
.product-item:first-child { padding-top: 0; }
.product-rank { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--ink-soft); background: var(--paper-dark); border-radius: 2px; flex-shrink: 0; margin-top: 1px; }
.product-rank.t1 { background: var(--vermillion); color: #fff; }
.product-rank.t2 { background: var(--ink-mid); color: #fff; }
.product-rank.t3 { background: var(--gold); color: #fff; }
.product-info { flex: 1; min-width: 0; }
.product-name-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.product-name { font-size: 12px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-gmv { font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--ink); white-space: nowrap; flex-shrink: 0; }
.product-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.cat-tag { display: inline-block; padding: 1px 6px; font-family: var(--font-mono); font-size: 9px; color: var(--ink-soft); border: 1px solid var(--rule); background: var(--paper); }
.qty-text { font-size: 10px; color: var(--ink-soft); }
.product-track { height: 4px; margin-top: 4px; background: rgba(17, 17, 17, 0.06); overflow: hidden; }
.product-track i { display: block; height: 100%; background: var(--ink-mid); transition: width var(--duration-normal); }

/* ----- Anchor ranking (compact) ----- */
.ranked-anchor { align-items: flex-start; }
.anchor-name-row { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.rank-track { height: 5px; margin-top: 5px; background: rgba(17, 17, 17, 0.08); overflow: hidden; }
.rank-track i { display: block; height: 100%; background: var(--vermillion); }

/* override global anchor-item spacing */
.anchor-item { padding: 7px 0; }
.anchor-item:first-child { padding-top: 0; }
.anchor-item:last-child { padding-bottom: 0; }

@media (max-width: 1100px) {
  .charts-row { grid-template-columns: 1fr; }
  .rankings-row { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .period-mode-row { flex-direction: column; align-items: flex-start; }
  .period-range-text { margin-left: 0; }
  .preset-chips { flex-wrap: wrap; }
  .custom-dates { flex-wrap: wrap; }
}
</style>
