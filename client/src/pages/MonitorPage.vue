<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { liveSessionsAPI } from '../api'
import PageHeader from '../components/PageHeader.vue'
import KpiCard from '../components/KpiCard.vue'
import { appendRealtimePoint, secondsSince, parseElapsedSeconds, formatElapsed, type RealtimePoint } from '../utils/realtimeSeries'
import { Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler)

const route = useRoute()
const auth = useAuthStore()

const sessionId = ref((route.query.id as string) || '')
const session = ref<any>(null)
const streaming = ref(false)
const eventSource = ref<EventSource | null>(null)
const localTimer = ref<number | null>(null)
const simulationStartMs = ref(0)

const metrics = ref({ online: 0, totalOrders: 0, gmv: 0, peakOnline: 0, duration: 0 })
const orders = ref<any[]>([])
const chats = ref<any[]>([])
const sentiment = ref({ positive: 0, neutral: 0, negative: 0 })
const insight = ref<any>(null)
const scriptRecommendation = ref<any>(null)
const signals = ref<any[]>([])
const connected = ref(false)
const currentProduct = ref<{ product_name: string; price: number } | null>(null)

// History arrays for charts — each point stores real elapsed seconds as X
const onlineHistory = ref<RealtimePoint[]>([])
const gmvHistory = ref<RealtimePoint[]>([])

function formatCurrency(v: number) { return v >= 10000 ? '¥' + (v / 10000).toFixed(1) + '万' : '¥' + v.toFixed(0) }
function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

async function loadSession() {
  try {
    const { data } = await liveSessionsAPI.get(sessionId.value)
    session.value = data
  } catch (e) { console.error(e) }
}

function connectSSE() {
  if (eventSource.value) eventSource.value.close()

  const url = liveSessionsAPI.getStreamUrl(sessionId.value)
  const es = new EventSource(`${url}?token=${auth.token}`)
  eventSource.value = es

  es.addEventListener('connected', () => { connected.value = true })
  es.addEventListener('snapshot', (e) => {
    const snapshot = JSON.parse(e.data)
    const nextMetrics = snapshot.metrics || metrics.value
    simulationStartMs.value = Date.now() - (Number(nextMetrics.duration) || 0) * 1000
    metrics.value = { ...nextMetrics, duration: secondsSince(simulationStartMs.value) }
    orders.value = Array.isArray(snapshot.orders) ? snapshot.orders : []
    chats.value = Array.isArray(snapshot.chats) ? snapshot.chats : []
    sentiment.value = snapshot.sentiment || sentiment.value
    currentProduct.value = snapshot.currentProduct || currentProduct.value
    insight.value = snapshot.insight || insight.value
    scriptRecommendation.value = snapshot.scriptRecommendation || scriptRecommendation.value
    // Reconstruct {x: elapsedSeconds, y: value} from snapshot arrays
    const snapLabels = Array.isArray(snapshot.series?.labels) ? snapshot.series.labels : []
    const snapOnline = Array.isArray(snapshot.series?.online) ? snapshot.series.online : []
    const snapGmv = Array.isArray(snapshot.series?.gmv) ? snapshot.series.gmv : []
    onlineHistory.value = snapOnline.map((y, i) => ({
      x: snapLabels[i] ? parseElapsedSeconds(snapLabels[i]) : i * 6,
      y,
    }))
    gmvHistory.value = snapGmv.map((y, i) => ({
      x: snapLabels[i] ? parseElapsedSeconds(snapLabels[i]) : i * 6,
      y,
    }))
    startLocalTimer()
  })
  es.addEventListener('metrics', (e) => {
    const nextMetrics = JSON.parse(e.data)
    if (!simulationStartMs.value) simulationStartMs.value = Date.now() - (Number(nextMetrics.duration) || 0) * 1000
    metrics.value = { ...nextMetrics, duration: secondsSince(simulationStartMs.value) }
    const elapsed = metrics.value.duration
    const onlineResult = appendRealtimePoint({
      points: onlineHistory.value,
      elapsedSeconds: elapsed,
      value: metrics.value.online,
      maxPoints: 100,
    })
    const gmvResult = appendRealtimePoint({
      points: gmvHistory.value,
      elapsedSeconds: elapsed,
      value: metrics.value.gmv,
      maxPoints: 100,
    })
    onlineHistory.value = onlineResult.points
    gmvHistory.value = gmvResult.points
  })
  es.addEventListener('order', (e) => {
    const order = JSON.parse(e.data)
    orders.value.unshift(order)
    if (orders.value.length > 50) orders.value.pop()
  })
  es.addEventListener('chat', (e) => {
    const chat = JSON.parse(e.data)
    chats.value.unshift(chat)
    if (chats.value.length > 100) chats.value.pop()
  })
  es.addEventListener('sentiment', (e) => { sentiment.value = JSON.parse(e.data) })
  es.addEventListener('llm_insight', (e) => { insight.value = JSON.parse(e.data) })
  es.addEventListener('current_product', (e) => { currentProduct.value = JSON.parse(e.data) })
  es.addEventListener('script_recommendation', (e) => {
    const rec = JSON.parse(e.data)
    scriptRecommendation.value = rec
    signals.value.unshift({ ...rec, time: new Date().toLocaleTimeString() })
    if (signals.value.length > 20) signals.value.pop()
  })
  es.onerror = () => { connected.value = false }
}

function startLocalTimer() {
  if (!simulationStartMs.value) simulationStartMs.value = Date.now() - metrics.value.duration * 1000
  if (localTimer.value) window.clearInterval(localTimer.value)
  localTimer.value = window.setInterval(() => {
    metrics.value = { ...metrics.value, duration: secondsSince(simulationStartMs.value) }
  }, 1000)
}

function stopLocalTimer() {
  if (localTimer.value) window.clearInterval(localTimer.value)
  localTimer.value = null
}

function startSim() {
  if (!sessionId.value) return
  liveSessionsAPI.startSimulate(sessionId.value).then(() => {
    streaming.value = true
    simulationStartMs.value = Date.now()
    metrics.value = { ...metrics.value, duration: 0 }
    startLocalTimer()
    connectSSE()
    loadSession()
  }).catch((e: any) => { alert('启动失败: ' + (e.response?.data?.message || e.message)) })
}

function stopSim() {
  if (!sessionId.value) return
  liveSessionsAPI.stopSimulate(sessionId.value).then(() => {
    streaming.value = false
    stopLocalTimer()
    simulationStartMs.value = 0
    if (eventSource.value) eventSource.value.close()
    loadSession()
  })
}

const copyMsg = ref('')
let copyMsgTimer: ReturnType<typeof setTimeout> | null = null

function copyScript(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    copyMsg.value = '话术已复制到剪贴板'
    if (copyMsgTimer) clearTimeout(copyMsgTimer)
    copyMsgTimer = setTimeout(() => { copyMsg.value = '' }, 2000)
  })
}

// Chart data — only show last 5 minutes, so Chart.js auto-fits
// the scale to the visible data without extra padding on either side.
const onlineChartData = computed(() => {
  const cutoff = Math.max(0, (metrics.value.duration || 0) - 300)
  const visible = cutoff > 0
    ? onlineHistory.value.filter((p) => p.x >= cutoff)
    : onlineHistory.value
  return {
    datasets: [{
      label: '在线人数',
      data: visible,
      borderColor: '#C41E3A',
      backgroundColor: 'rgba(196, 30, 58, 0.06)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
    }],
  }
})

const sentimentChartData = computed(() => ({
  labels: ['正面', '中性', '负面'],
  datasets: [{
    data: [sentiment.value.positive || 1, sentiment.value.neutral || 1, sentiment.value.negative || 1],
    backgroundColor: ['#2D6A4F', '#C8C2B3', '#C41E3A'],
    borderWidth: 0,
  }],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { left: 0, right: 0, top: 8, bottom: 0 } },
  plugins: { legend: { display: false } },
  scales: {
    x: {
      type: 'linear' as const,
      bounds: 'data' as const,
      display: true,
      grid: { display: false },
      title: {
        display: true,
        text: '直播时长 (近5分钟)',
        font: { size: 10 },
        color: 'var(--ink-soft)',
      },
      ticks: {
        maxTicksLimit: 6,
        font: { size: 10 },
        callback: (val: string | number) => {
          const seconds = typeof val === 'number' ? val : Number(val)
          if (!Number.isFinite(seconds) || seconds < 0) return ''
          return formatElapsed(seconds)
        },
      },
    },
    y: {
      display: true,
      grid: { color: 'rgba(200,194,179,0.3)' },
      title: {
        display: true,
        text: '在线人数',
        font: { size: 10 },
        color: 'var(--ink-soft)',
      },
      ticks: { font: { size: 10 } },
    },
  },
}))

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const, labels: { padding: 16, font: { size: 11 } } },
  },
}

onMounted(async () => {
  if (sessionId.value) {
    await loadSession()
    if (session.value?.live_status === '进行中') {
      streaming.value = true
      simulationStartMs.value = Date.now() - metrics.value.duration * 1000
      startLocalTimer()
      connectSSE()
    }
  }
})

onUnmounted(() => {
  if (eventSource.value) eventSource.value.close()
  stopLocalTimer()
  if (copyMsgTimer) clearTimeout(copyMsgTimer)
})
</script>

<template>
  <PageHeader title="直播实时监控" subtitle="实时数据 / 弹幕分析 / AI话术助手" />
  <div class="page-body">
    <div v-if="!sessionId" style="text-align:center;padding:60px;color:var(--ink-soft);">
      <p>请从"直播场次"页面选择一个场次进入监控。</p>
      <router-link to="/live-sessions" class="btn" style="margin-top:16px;">前往直播场次</router-link>
    </div>

    <template v-else>
      <!-- Live Header -->
      <div class="live-header-bar">
        <div class="live-status-dot"></div>
        <div>
          <span class="live-title-main">{{ session?.live_title || '加载中...' }}</span>
          <div class="live-meta">{{ session?.anchor_name }} | {{ session?.platform }} | {{ session?.live_category }}</div>
        </div>
        <span class="live-timer">{{ formatDuration(metrics.duration) }}</span>
        <div v-if="currentProduct" class="current-product-tag">
          正在讲解：{{ currentProduct.product_name?.substring(0, 10) }} ¥{{ currentProduct.price }}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button v-if="!streaming" class="btn primary" @click="startSim">开始模拟</button>
          <button v-else class="btn danger" @click="stopSim">停止模拟</button>
        </div>
      </div>

      <!-- KPI Row -->
      <div class="monitor-kpi-row">
        <KpiCard label="在线人数" :value="metrics.online.toLocaleString()" />
        <KpiCard label="累计订单" :value="metrics.totalOrders.toLocaleString()" />
        <KpiCard label="累计 GMV" :value="formatCurrency(metrics.gmv)" />
        <KpiCard label="峰值在线" :value="metrics.peakOnline.toLocaleString()" />
      </div>

      <!-- Charts Row -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-bottom:24px;">
        <div class="card">
          <div class="card-header"><span class="card-title">在线人数趋势</span></div>
          <div class="card-divider"></div>
          <div class="card-body" style="height:200px;">
            <Line :data="onlineChartData" :options="chartOptions" />
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">弹幕情绪分布</span></div>
          <div class="card-divider"></div>
          <div class="card-body" style="height:200px;">
            <Doughnut :data="sentimentChartData" :options="doughnutOptions" />
          </div>
        </div>
      </div>

      <!-- Three-column layout -->
      <div style="display:grid;grid-template-columns:220px 1fr 320px;gap:24px;">
        <!-- Left: Orders -->
        <div class="card" style="height:fit-content;">
          <div class="card-header"><span class="card-title">实时订单</span></div>
          <div class="card-divider"></div>
          <div class="card-body" style="max-height:360px;overflow-y:auto;padding:12px;">
            <div v-if="orders.length === 0" style="color:var(--ink-soft);font-size:13px;text-align:center;padding:12px;">等待订单...</div>
            <div v-for="o in orders.slice(0, 15)" :key="o.orderId" class="order-item">
              <div>
                <span class="order-user">{{ o.nickname?.substring(0, 6) }}</span>
                <span class="order-product">{{ o.productName }}</span>
              </div>
              <span class="order-amount">¥{{ o.amount }}</span>
            </div>
          </div>
        </div>

        <!-- Center: Chat Stream + Insight -->
        <div>
          <div class="card" style="margin-bottom:24px;">
            <div class="card-header">
              <span class="card-title">弹幕流</span>
              <span class="card-extra">共 {{ chats.length }} 条</span>
            </div>
            <div class="card-divider"></div>
            <div class="card-body chat-stream" style="max-height:320px;overflow-y:auto;">
              <div v-if="chats.length === 0" style="color:var(--ink-soft);font-size:13px;">等待弹幕...</div>
              <div v-for="c in chats.slice(-30)" :key="c.id" class="chat-item">
                <span class="chat-user">{{ c.nickname }}</span>
                <span class="chat-content">{{ c.content }}</span>
              </div>
            </div>
          </div>

          <!-- LLM Insight -->
          <div v-if="insight" class="card">
            <div class="card-header"><span class="card-title">AI 洞察</span></div>
            <div class="card-divider"></div>
            <div class="card-body">
              <div class="insight-row">
                <span class="insight-label">情绪趋势</span>
                <span>{{ insight.moodTrend }}</span>
              </div>
              <div v-if="insight.focusPoints?.length" class="insight-row">
                <span class="insight-label">关注焦点</span>
                <span v-for="fp in insight.focusPoints" :key="fp" class="badge badge-info" style="margin-right:4px;">{{ fp }}</span>
              </div>
              <div v-if="insight.riskAlerts?.length" class="insight-row">
                <span class="insight-label" style="color:var(--vermillion);">风险提示</span>
                <span style="color:var(--vermillion);">{{ insight.riskAlerts.join(', ') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: AI Script Assistant -->
        <div class="card" style="height:fit-content;">
          <div class="card-header"><span class="card-title">AI 话术助手</span></div>
          <div class="card-divider"></div>
          <div class="card-body">
            <div v-if="scriptRecommendation" class="script-card">
              <div class="script-trigger">
                ⚡ {{ scriptRecommendation.trigger }} · {{ scriptRecommendation.reason }}
              </div>
              <div class="script-content">
                "{{ scriptRecommendation.scriptSnippet }}"
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn small primary" @click="copyScript(scriptRecommendation.scriptSnippet)">复制话术</button>
                <button class="btn small" @click="scriptRecommendation = null">换一条</button>
              </div>
              <div v-if="copyMsg" class="copy-toast">{{ copyMsg }}</div>
            </div>
            <div v-else class="script-empty">
              等待信号触发...<br/>
              <span style="font-size:11px;">检测到价格质疑/购买意向/产品咨询/负面情绪/冷场时自动推送</span>
            </div>

            <div v-if="signals.length > 0" style="margin-top:16px;">
              <div class="section-label">信号触发日志</div>
              <div v-for="(s, i) in signals.slice(-8)" :key="i" class="signal-item">
                <span class="signal-time">{{ s.time }}</span>
                <span class="signal-name">{{ s.trigger }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.live-header-bar {
  background: var(--paper-dark); border: 1px solid var(--rule-soft);
  padding: 14px 24px; border-radius: 2px;
  display: flex; align-items: center; gap: 20px; margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}
.live-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vermillion); animation: pulse 2s infinite; flex-shrink: 0; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.live-title-main { font-family: var(--font-serif); font-size: 16px; font-weight: 700; }
.live-meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); }
.live-timer { font-family: var(--font-mono); font-size: 22px; font-weight: 600; color: var(--vermillion); }
.current-product-tag {
  background: var(--info-soft); color: var(--info);
  padding: 4px 12px; font-size: 12px; font-weight: 600; border-radius: 2px;
}
.monitor-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
.monitor-kpi-row :deep(.kpi-card) { padding: 14px 18px 14px; }
.monitor-kpi-row :deep(.kpi-label) { font-size: 10px; margin-bottom: 4px; letter-spacing: 0.06em; }
.monitor-kpi-row :deep(.kpi-value) { font-size: 28px; }

/* Order items */
.order-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 0; border-bottom: 1px solid var(--rule-soft); font-size: 12px;
}
.order-user { font-weight: 600; margin-right: 6px; }
.order-product { color: var(--ink-soft); font-size: 11px; }
.order-amount { font-family: var(--font-mono); color: var(--vermillion); font-weight: 600; }

/* Chat */
.chat-item { padding: 7px 0; border-bottom: 1px solid var(--rule-soft); font-size: 13px; line-height: 1.5; }
.chat-user { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); letter-spacing: 0.04em; margin-right: 8px; }
.chat-content { color: var(--ink-mid); }

/* Insight */
.insight-row { margin-bottom: 8px; font-size: 13px; }
.insight-label { font-size: 11px; font-family: var(--font-mono); color: var(--ink-soft); margin-right: 8px; }

/* Script */
.script-card { background: var(--info-soft); padding: 12px; border-radius: 2px; margin-bottom: 16px; }
.script-trigger { font-size: 11px; font-family: var(--font-mono); color: var(--info); margin-bottom: 6px; }
.script-content { font-size: 14px; line-height: 1.6; margin-bottom: 10px; }
.script-empty { color: var(--ink-soft); font-size: 13px; text-align: center; padding: 20px; }

/* Signals */
.section-label { font-size: 12px; font-family: var(--font-mono); color: var(--ink-soft); margin-bottom: 8px; }
.signal-item { font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--rule-soft); }
.signal-time { font-family: var(--font-mono); color: var(--ink-soft); }
.signal-name { color: var(--info); margin-left: 8px; }

.copy-toast {
  margin-top: 8px;
  padding: 6px 10px;
  background: var(--ink);
  color: var(--paper);
  font-size: 12px;
  font-family: var(--font-mono);
  text-align: center;
}
</style>
