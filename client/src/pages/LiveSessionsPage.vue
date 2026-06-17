<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { liveSessionsAPI } from '../api'
import type { LiveSession } from '../types'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DataTable from '../components/DataTable.vue'
import Pagination from '../components/Pagination.vue'
import { getLiveSessionTargetPath } from '../utils/liveNavigation'
import { LIVE_SESSION_STATUS_ORDER, countLiveSessionStatuses, nextStatusFilter } from '../utils/liveSessionStatus'

const router = useRouter()
const sessions = ref<(LiveSession & Record<string, any>)[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const statusFilter = ref('')
const search = ref('')
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
const loading = ref(false)
const statusCounts = ref<Record<string, number>>({})
let loadRequestId = 0

function doSearch() {
  page.value = 1
  load()
}

function handleSortChange(state: { key: string; direction: string } | null) {
  if (!state) return
  sortBy.value = state.key
  sortDir.value = state.direction as 'asc' | 'desc'
  load()
}

async function load() {
  const requestId = ++loadRequestId
  loading.value = true
  try {
    const { data } = await liveSessionsAPI.list({ page: page.value, pageSize, status: statusFilter.value, search: search.value, sortBy: sortBy.value, sortDir: sortDir.value })
    if (requestId !== loadRequestId) return
    sessions.value = data.data
    total.value = data.total
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

async function loadStatusCounts() {
  const { data } = await liveSessionsAPI.list({ page: 1, pageSize: 1000 })
  statusCounts.value = countLiveSessionStatuses(data.data || [])
}

async function refresh() {
  await Promise.all([load(), loadStatusCounts()])
}

function setStatusFilter(status: string) {
  page.value = 1
  statusFilter.value = nextStatusFilter(statusFilter.value, status)
  load()
}

function onStatusSelectChange() {
  page.value = 1
  load()
}

function goPlanning() {
  router.push('/live-planning')
}

function goSession(session: LiveSession) {
  // Route all plannable (unstarted) sessions to the planning page
  if (session.live_status === '待安排' || session.live_status === '已排期') {
    router.push(`/live-planning?liveId=${session.live_id}`)
    return
  }
  router.push(getLiveSessionTargetPath(session))
}

function getActionLabel(status: string) {
  if (status === '待安排') return '安排场次'
  if (status === '已排期') return '查看安排'
  if (status === '进行中') return '监控中'
  return '查看复盘'
}

const statusMeta: Record<string, { label: string; hint: string; className: string }> = {
  '待安排': { label: '待安排', hint: '待生成带货计划', className: 'unplanned' },
  '进行中': { label: '进行中', hint: '可进入实时监控', className: 'live' },
  '已排期': { label: '已排期', hint: '等待开播', className: 'scheduled' },
  '已结束': { label: '已结束', hint: '可查看复盘数据', className: 'ended' },
}

const statusCards = computed(() => LIVE_SESSION_STATUS_ORDER.map((status) => ({
  status,
  count: statusCounts.value[status] || 0,
  ...statusMeta[status],
})))

function formatDate(d: string) { return d ? new Date(d).toLocaleString('zh-CN') : '-' }
function formatPrice(v: number) { return v ? '¥' + v.toLocaleString() : '-' }
function getSessionRowClass(row: LiveSession) {
  return `session-row status-${statusMeta[row.live_status]?.className || 'default'}`
}

function changePage(p: number) { page.value = p; load() }

onMounted(() => { refresh() })

const columns = [
  { key: 'live_title', label: '直播标题', width: '22%' },
  { key: 'anchor_name', label: '主播', width: '10%' },
  { key: 'platform', label: '平台', width: '6%' },
  { key: 'live_category', label: '品类', width: '7%' },
  { key: 'start_time', label: '开始时间', width: '13%' },
  { key: 'live_status', label: '状态', width: '7%' },
  { key: 'online_peak', label: '峰值在线', width: '7%' },
  { key: 'total_sales', label: '销售额', width: '12%' },
  { key: 'actions', label: '操作', sortable: false, width: '16%' },
]

</script>

<template>
  <PageHeader title="直播场次" subtitle="场次安排与管理" />
  <div class="page-body">
    <div class="toolbar">
      <input v-model="search" class="input" placeholder="搜索标题/主播/平台/品类..." @keyup.enter="doSearch()" style="width:240px;" />
      <button class="btn" @click="doSearch()">搜索</button>
      <select v-model="statusFilter" class="form-select" style="width:auto;" @change="onStatusSelectChange">
        <option value="">全部状态</option>
        <option value="待安排">待安排</option>
        <option value="已排期">已排期</option>
        <option value="进行中">进行中</option>
        <option value="已结束">已结束</option>
      </select>
      <button class="btn primary" @click="goPlanning">进入场次安排</button>
      <button class="btn" @click="refresh">刷新</button>
      <span class="toolbar-hint">新增未开播场次、排品和确认排期统一在“场次安排”完成。</span>
    </div>

    <div class="status-strip">
      <button
        v-for="card in statusCards"
        :key="card.status"
        class="status-card"
        :class="[card.className, { active: statusFilter === card.status }]"
        type="button"
        @click="setStatusFilter(card.status)"
      >
        <span class="status-card-label">{{ card.label }}</span>
        <strong>{{ card.count }}</strong>
        <span>{{ card.hint }}</span>
      </button>
    </div>

    <DataTable :columns="columns" :data="sessions" :loading="loading" :row-class="getSessionRowClass" @row-click="goSession" @sort-change="handleSortChange">
      <template #cell-start_time="{ value }">{{ formatDate(value) }}</template>
      <template #cell-live_status="{ value }">
        <StatusBadge :status="value" />
      </template>
      <template #cell-online_peak="{ value }">{{ value?.toLocaleString() || '-' }}</template>
      <template #cell-total_sales="{ value }">{{ formatPrice(value) }}</template>
      <template #cell-actions="{ row }">
        <div class="actions-cell">
          <button
            class="btn small"
            :class="{ primary: row.live_status !== '已结束' }"
            @click.stop="goSession(row)"
          >
            {{ getActionLabel(row.live_status) }}
          </button>
        </div>
      </template>
    </DataTable>

    <Pagination v-if="total > pageSize" :page="page" :total="total" :page-size="pageSize" @change="changePage" />
  </div>
</template>

<style scoped>
.actions-cell {
  display: flex; gap: 8px; white-space: nowrap;
}

.toolbar-hint {
  color: var(--ink-soft);
  font-size: 13px;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.status-card {
  border: 1px solid var(--rule-soft);
  background: var(--paper-dark);
  color: var(--ink);
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  align-items: end;
}

.status-card strong {
  font-family: var(--font-serif);
  font-size: 28px;
  line-height: 1;
}

.status-card span:last-child {
  color: var(--ink-soft);
  font-size: 12px;
}

.status-card-label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
}

.status-card.live,
.status-card.live.active {
  border-left: 4px solid var(--vermillion);
}

.status-card.scheduled,
.status-card.scheduled.active {
  border-left: 4px solid var(--info);
}

.status-card.unplanned,
.status-card.unplanned.active {
  border-left: 4px solid var(--warning);
}

.status-card.ended,
.status-card.ended.active {
  border-left: 4px solid var(--success);
}

.status-card.active {
  box-shadow: 4px 4px 0 var(--ink);
}

:deep(.session-row td:first-child) {
  border-left: 4px solid transparent;
}

:deep(.session-row.status-live td:first-child) {
  border-left-color: var(--vermillion);
}

:deep(.session-row.status-scheduled td:first-child) {
  border-left-color: var(--info);
}

:deep(.session-row.status-unplanned td:first-child) {
  border-left-color: var(--warning);
}

:deep(.session-row.status-ended td:first-child) {
  border-left-color: var(--success);
}

:deep(.session-row.status-live td) {
  background: rgba(196, 30, 58, 0.035);
}

:deep(.session-row.status-unplanned td) {
  background: rgba(188, 125, 43, 0.035);
}

@media (max-width: 900px) {
  .status-strip {
    grid-template-columns: 1fr;
  }
}
</style>
