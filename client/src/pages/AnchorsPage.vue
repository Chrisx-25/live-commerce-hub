<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api, { anchorsAPI } from '../api'
import type { Anchor } from '../types'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DataTable from '../components/DataTable.vue'
import Pagination from '../components/Pagination.vue'
import {
  Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js'
import { Radar } from 'vue-chartjs'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const anchors = ref<Anchor[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const search = ref('')
const levelFilter = ref('')
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
const loading = ref(false)

const showModal = ref(false)
const editing = ref<Anchor | null>(null)
const form = ref({
  anchor_name: '', gender: '女', join_date: '', account_platform: '抖音',
  fan_count: 0, specialization: '', anchor_level: 'C', status: '在岗',
})

// Detail modal
const showDetail = ref(false)
const detail = ref<any>(null)
const chartData = ref<any>(null)
// Select for comparison — up to 4 anchors
const maxCompare = 4
const selectedIds = ref<Set<string>>(new Set())
function toggleSelect(id: string) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else if (s.size < maxCompare) s.add(id)
  else { /* reached max, do nothing */ }
  selectedIds.value = s
}

// Compare
const compareColors = ['#C41E3A', '#3A3A3A', '#B58940', '#2C5F8A']
const compareBgColors = ['rgba(196,30,58,0.12)', 'rgba(58,58,58,0.12)', 'rgba(181,137,64,0.12)', 'rgba(44,95,138,0.12)']
const showCompare = ref(false)
const compareData = ref<any[]>([])
const compareChart = ref<any>(null)
const compareHighlights = ref<Record<string, number>>({})
const compareOptions = {
  responsive: true,
  maintainAspectRatio: true,
  scales: {
    r: {
      beginAtZero: true, max: 10, min: 0,
      ticks: { stepSize: 2, font: { size: 11 } },
      pointLabels: { font: { size: 13, family: '"Noto Sans SC"' } },
    },
  },
}

function clearCompare() { selectedIds.value = new Set() }

async function doCompare() {
  if (selectedIds.value.size < 2) { alert('请至少勾选2位主播进行对比'); return }
  const ids = [...selectedIds.value]
  const results = []
  for (const id of ids) {
    try {
      const { data } = await api.get(`/anchors/${id}/detail`)
      results.push(data)
    } catch {}
  }
  if (results.length < 2) { alert('加载失败'); return }
  compareData.value = results
  // Compute best for each metric
  const metrics = ['totalGmv', 'totalSessions', 'avgConversion', 'avgPerformance', 'avgWatchTime'] as const
  const h: Record<string, number> = {}
  for (const m of metrics) {
    h[m] = Math.max(...results.map(r => r.stats?.[m] ?? 0))
  }
  h['fan_count'] = Math.max(...results.map(r => r.anchor?.fan_count ?? 0))
  compareHighlights.value = h
  compareChart.value = {
    labels: results[0].radar?.dimensions?.map((d: any) => d.name) || [],
    datasets: results.map((r, i) => ({
      label: r.anchor.anchor_name,
      data: r.radar?.dimensions?.map((d: any) => d.value) || [],
      backgroundColor: compareBgColors[i],
      borderColor: compareColors[i],
      borderWidth: 2,
      pointBackgroundColor: compareColors[i],
    })),
  }
  showCompare.value = true
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  scales: {
    r: {
      beginAtZero: true, max: 10, min: 0,
      ticks: { stepSize: 2, font: { size: 11 } },
      pointLabels: { font: { size: 13, family: '"Noto Sans SC"' } },
    },
  },
  plugins: { legend: { display: false } },
}

const levels = ['S', 'A', 'B', 'C']
const platforms = ['抖音', '快手']

function handleSortChange(state: { key: string; direction: string } | null) {
  if (!state) return
  sortBy.value = state.key
  sortDir.value = state.direction as 'asc' | 'desc'
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const { data } = await anchorsAPI.list({ page: page.value, pageSize, search: search.value, level: levelFilter.value, sortBy: sortBy.value, sortDir: sortDir.value })
    anchors.value = data.data
    total.value = data.total
  } finally { loading.value = false }
}

function openCreate() {
  editing.value = null
  form.value = { anchor_name: '', gender: '女', join_date: new Date().toISOString().split('T')[0], account_platform: '抖音', fan_count: 0, specialization: '', anchor_level: 'C', status: '在岗' }
  showModal.value = true
}

function openEdit(a: Anchor) {
  editing.value = a
  form.value = {
    anchor_name: a.anchor_name, gender: a.gender, join_date: a.join_date || '',
    account_platform: a.account_platform, fan_count: a.fan_count,
    specialization: a.specialization || '', anchor_level: a.anchor_level, status: a.status,
  }
  showModal.value = true
}

async function save() {
  try {
    if (editing.value) {
      await anchorsAPI.update(editing.value.anchor_id, form.value)
    } else {
      await anchorsAPI.create(form.value)
    }
    showModal.value = false
    await load()
  } catch (e: any) { alert(e.response?.data?.message || '保存失败') }
}

async function remove(a: Anchor) {
  if (!confirm(`确认删除主播 "${a.anchor_name}"？`)) return
  await anchorsAPI.delete(a.anchor_id)
  await load()
}

async function viewDetail(a: Anchor) {
  try {
    const { data } = await api.get(`/anchors/${a.anchor_id}/detail`)
    detail.value = data
    if (data.radar) {
      chartData.value = {
        labels: data.radar.dimensions.map((d: any) => d.name),
        datasets: [{
          label: a.anchor_name,
          data: data.radar.dimensions.map((d: any) => d.value),
          backgroundColor: 'rgba(196, 30, 58, 0.15)',
          borderColor: 'rgba(196, 30, 58, 0.8)',
          borderWidth: 2,
          pointBackgroundColor: '#C41E3A',
        }],
      }
    } else {
      chartData.value = null
    }
    showDetail.value = true
  } catch { alert('暂无详情数据') }
}

function changePage(p: number) { page.value = p; load() }
function getLevelClass(l: string) { return `level-${l}` }
function formatCurrency(v: number) { return v >= 10000 ? '¥' + (v / 10000).toFixed(1) + '万' : '¥' + v.toLocaleString() }
function isTop(val: number, metric: string) { return compareHighlights.value[metric] > 0 && val === compareHighlights.value[metric] }

onMounted(() => load())

const columns = [
  { key: 'compare', label: '对比', width: '6%' },
  { key: 'anchor_name', label: '主播姓名', width: '14%' },
  { key: 'gender', label: '性别', width: '6%' },
  { key: 'account_platform', label: '平台', width: '8%' },
  { key: 'fan_count', label: '粉丝数', width: '10%' },
  { key: 'specialization', label: '擅长品类', width: '12%' },
  { key: 'anchor_level', label: '等级', width: '7%' },
  { key: 'status', label: '状态', width: '7%' },
  { key: 'actions', label: '操作', width: '16%' },
]
</script>

<template>
  <PageHeader title="主播管理" subtitle="主播信息维护与能力画像" />
  <div class="page-body">
    <div class="toolbar">
      <input v-model="search" class="input" placeholder="搜索主播姓名..." @keyup.enter="load()" />
      <button class="btn" @click="load()">搜索</button>
      <select v-model="levelFilter" class="form-select" style="width:auto;" @change="load()">
        <option value="">全部等级</option>
        <option v-for="l in levels" :key="l" :value="l">{{ l }}级</option>
      </select>
      <span style="flex:1;"></span>
      <button v-if="selectedIds.size > 0" class="btn small" @click="clearCompare">清除勾选</button>
      <button v-if="selectedIds.size >= 2" class="btn" @click="doCompare">对比主播 ({{ selectedIds.size }})</button>
      <button class="btn primary" @click="openCreate">+ 新增主播</button>
      <button class="btn" @click="load()">刷新</button>
    </div>

    <DataTable :columns="columns" :data="anchors" :loading="loading" @sort-change="handleSortChange">
      <template #cell-compare="{ row }">
        <span class="compare-check" :class="{ checked: selectedIds.has(row.anchor_id) }" @click="toggleSelect(row.anchor_id)">
          <span v-if="selectedIds.has(row.anchor_id)" class="compare-check-mark">&#10003;</span>
        </span>
      </template>
      <template #cell-anchor_name="{ row }">
        <span style="font-weight:600;cursor:pointer;" @click="viewDetail(row)">{{ row.anchor_name }}</span>
      </template>
      <template #cell-fan_count="{ value }">{{ (value / 10000).toFixed(1) }}万</template>
      <template #cell-anchor_level="{ value }">
        <span :class="getLevelClass(value)">{{ value }}</span>
      </template>
      <template #cell-status="{ value }">
        <StatusBadge :status="value" />
      </template>
      <template #cell-actions="{ row }">
        <button class="btn small" @click="viewDetail(row)">详情</button>
        <button class="btn small" @click="openEdit(row)">编辑</button>
        <button class="btn small danger" @click="remove(row)">删除</button>
      </template>
    </DataTable>

    <Pagination v-if="total > pageSize" :page="page" :total="total" :page-size="pageSize" @change="changePage" />

    <!-- Edit Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal" style="padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">{{ editing ? '编辑主播' : '新增主播' }}</span>
          <span class="modal-close" @click="showModal = false">&times;</span>
        </div>
        <div class="form-group">
          <label class="form-label">主播姓名</label>
          <input v-model="form.anchor_name" class="form-input" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">性别</label>
            <select v-model="form.gender" class="form-select">
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">平台</label>
            <select v-model="form.account_platform" class="form-select">
              <option v-for="p in platforms" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">粉丝数</label>
            <input v-model.number="form.fan_count" type="number" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">等级</label>
            <select v-model="form.anchor_level" class="form-select">
              <option v-for="l in levels" :key="l" :value="l">{{ l }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">擅长品类</label>
          <input v-model="form.specialization" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">入职时间</label>
          <input v-model="form.join_date" type="date" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">状态</label>
          <select v-model="form.status" class="form-select">
            <option value="在岗">在岗</option>
            <option value="休假">休假</option>
            <option value="离职">离职</option>
          </select>
        </div>
        <div class="form-actions">
          <button class="btn" @click="showModal = false">取消</button>
          <button class="btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="showDetail && detail" class="modal-overlay" @click.self="showDetail = false">
      <div class="modal" style="min-width:680px;max-width:800px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">{{ detail.anchor.anchor_name }} · 详细数据</span>
          <span class="modal-close" @click="showDetail = false">&times;</span>
        </div>

        <!-- Basic info -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
          <div class="info-item">
            <span class="info-label">等级</span>
            <span :class="getLevelClass(detail.anchor.anchor_level)">{{ detail.anchor.anchor_level }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">平台</span>
            <span>{{ detail.anchor.account_platform }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">粉丝</span>
            <span>{{ (detail.anchor.fan_count / 10000).toFixed(1) }}万</span>
          </div>
          <div class="info-item">
            <span class="info-label">擅长</span>
            <span>{{ detail.anchor.specialization }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">入职</span>
            <span>{{ detail.anchor.join_date?.split('T')[0] }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">累计GMV</span>
            <span style="font-weight:700;">{{ formatCurrency(detail.stats.totalGmv) }}</span>
          </div>
        </div>

        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
          <div class="stat-mini">
            <div class="stat-mini-val">{{ detail.stats.totalSessions }}</div>
            <div class="stat-mini-label">直播场次</div>
          </div>
          <div class="stat-mini">
            <div class="stat-mini-val">{{ detail.stats.avgConversion?.toFixed(2) }}%</div>
            <div class="stat-mini-label">平均转化率</div>
          </div>
          <div class="stat-mini">
            <div class="stat-mini-val">{{ (detail.stats.avgWatchTime / 60)?.toFixed(1) }}分</div>
            <div class="stat-mini-label">平均停留</div>
          </div>
          <div class="stat-mini">
            <div class="stat-mini-val">{{ detail.stats.avgPerformance?.toFixed(1) }}</div>
            <div class="stat-mini-label">综合绩效分</div>
          </div>
        </div>

        <!-- Radar + Sessions -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div>
            <div style="font-family:var(--font-serif);font-size:14px;font-weight:700;margin-bottom:12px;">能力雷达图</div>
            <div v-if="chartData" style="width:280px;height:280px;margin:0 auto;">
              <Radar :data="chartData" :options="chartOptions" />
            </div>
            <div v-else style="padding:40px;text-align:center;color:var(--ink-soft);">暂无绩效数据</div>
          </div>
          <div>
            <div style="font-family:var(--font-serif);font-size:14px;font-weight:700;margin-bottom:12px;">近期直播</div>
            <div v-if="detail.recentSessions?.length" class="session-list">
              <div class="session-row" v-for="s in detail.recentSessions.slice(0, 8)" :key="s.live_id">
                <span class="session-date">{{ s.start_time?.split('T')[0] }}</span>
                <span class="session-title">{{ s.live_title }}</span>
                <span :class="'badge ' + (s.live_status === '已结束' ? 'badge-success' : s.live_status === '进行中' ? 'badge-info' : 'badge-default')">{{ s.live_status }}</span>
              </div>
            </div>
            <div v-else style="padding:20px;color:var(--ink-soft);">暂无直播记录</div>
          </div>
        </div>

      </div>
    </div>

    <!-- Compare Modal -->
    <div v-if="showCompare && compareData.length >= 2" class="modal-overlay" @click.self="showCompare = false">
      <div class="modal" style="min-width:720px;max-width:1000px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">主播对比</span>
          <span class="modal-close" @click="showCompare = false">&times;</span>
        </div>

        <!-- Side-by-side panels — dynamic columns -->
        <div :style="{ display:'grid', gridTemplateColumns:'repeat('+compareData.length+', 1fr)', gap:'16px', marginBottom:'20px' }">
          <div v-for="(d, i) in compareData" :key="i" class="compare-panel" :style="{ borderLeftColor: compareColors[i] }">
            <div class="compare-name">
              {{ d.anchor.anchor_name }}
              <span :class="getLevelClass(d.anchor.anchor_level)" style="margin-left:6px;">{{ d.anchor.anchor_level }}</span>
            </div>
            <div class="compare-info">
              <span class="compare-label">平台</span>
              <span class="compare-val">{{ d.anchor.account_platform }}</span>
            </div>
            <div class="compare-info">
              <span class="compare-label">粉丝</span>
              <span class="compare-val" :class="{ 'compare-best': isTop(d.anchor.fan_count, 'fan_count') }">{{ (d.anchor.fan_count / 10000).toFixed(1) }}万</span>
            </div>
            <div class="compare-info">
              <span class="compare-label">累计GMV</span>
              <span class="compare-val" :class="{ 'compare-best': isTop(d.stats.totalGmv, 'totalGmv') }">{{ formatCurrency(d.stats.totalGmv) }}</span>
            </div>
            <div class="compare-info">
              <span class="compare-label">直播场次</span>
              <span class="compare-val" :class="{ 'compare-best': isTop(d.stats.totalSessions, 'totalSessions') }">{{ d.stats.totalSessions }}</span>
            </div>
            <div class="compare-info">
              <span class="compare-label">转化率</span>
              <span class="compare-val" :class="{ 'compare-best': isTop(d.stats.avgConversion, 'avgConversion') }">{{ d.stats.avgConversion?.toFixed(2) }}%</span>
            </div>
            <div class="compare-info">
              <span class="compare-label">绩效分</span>
              <span class="compare-val" :class="{ 'compare-best': isTop(d.stats.avgPerformance, 'avgPerformance') }">{{ d.stats.avgPerformance?.toFixed(1) }}</span>
            </div>
          </div>
        </div>

        <!-- Radar Chart -->
        <div v-if="compareChart" style="width:380px;height:380px;margin:0 auto;">
          <div style="font-family:var(--font-serif);font-size:14px;font-weight:700;margin-bottom:8px;text-align:center;">能力对比</div>
          <Radar :data="compareChart" :options="compareOptions" />
        </div>
        <div v-else style="padding:40px;text-align:center;color:var(--ink-soft);">暂无绩效数据可供对比</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px;
}
.info-label {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-soft); letter-spacing: 0.05em;
  min-width: 60px;
}
.stat-mini {
  text-align: center; padding: 12px;
  background: var(--paper-dark); border: 1px solid var(--rule-soft);
  border-radius: 2px;
}
.stat-mini-val {
  font-family: var(--font-serif); font-size: 26px; font-weight: 900;
  color: var(--ink);
}
.stat-mini-label {
  font-family: var(--font-sans); font-size: 13px; color: var(--ink-soft);
  margin-top: 4px; font-weight: 500;
}
.session-list {
  max-height: 260px; overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--rule) transparent;
}
.session-list::-webkit-scrollbar { width: 4px; }
.session-list::-webkit-scrollbar-track { background: transparent; }
.session-list::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 2px; }
.session-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0; border-bottom: 1px solid var(--rule-soft);
  font-size: 13px;
}
.session-date {
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft);
  min-width: 80px;
}
.session-title { flex: 1; color: var(--ink-mid); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Compare checkbox */
.compare-check {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  border: 1.5px solid var(--rule);
  cursor: pointer; user-select: none; -webkit-user-select: none;
  transition: all var(--duration-fast) var(--ease-expo);
}
.compare-check:hover { border-color: var(--ink); }
.compare-check.checked {
  background: var(--ink); border-color: var(--ink);
}
.compare-check-mark {
  color: var(--paper); font-size: 12px; font-weight: 700; line-height: 1;
}

/* Modal close X */
.modal-close {
  font-family: var(--font-serif); font-size: 28px; line-height: 1;
  color: var(--ink-soft); cursor: pointer;
  padding: 0 4px; transition: color var(--duration-fast);
}
.modal-close:hover { color: var(--vermillion); }

/* Compare panels */
.compare-panel {
  padding: 16px 18px;
  border: 1px solid var(--rule-soft);
  border-left-width: 3px; border-left-style: solid;
  background: var(--paper-dark);
}
.compare-name {
  font-family: var(--font-serif); font-size: 15px; font-weight: 700;
  margin-bottom: 12px; padding-bottom: 8px;
  border-bottom: 1px solid var(--rule-soft);
}
.compare-info {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0; font-size: 13px;
}
.compare-label {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-soft); letter-spacing: 0.05em;
  min-width: 56px;
}
.compare-val {
  font-family: var(--font-sans); color: var(--ink-mid);
}
.compare-best {
  color: var(--vermillion); font-weight: 700;
}
</style>
