<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { afterSalesAPI } from '../api'
import type { AfterSale } from '../types'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DataTable from '../components/DataTable.vue'
import Pagination from '../components/Pagination.vue'

const items = ref<(AfterSale & Record<string, any>)[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const statusFilter = ref('')
const typeFilter = ref('')
const levelFilter = ref('')
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
const loading = ref(false)
const selectedItem = ref<(AfterSale & Record<string, any>) | null>(null)

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
    const { data } = await afterSalesAPI.list({
      page: page.value,
      pageSize,
      status: statusFilter.value,
      type: typeFilter.value,
      level: levelFilter.value,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
    })
    items.value = data.data
    total.value = data.total
    if (!selectedItem.value || !items.value.some((item) => item.aftersale_id === selectedItem.value?.aftersale_id)) {
      selectedItem.value = items.value[0] || null
    }
  } finally { loading.value = false }
}

async function updateStatus(item: AfterSale, status: string) {
  const { data } = await afterSalesAPI.update(item.aftersale_id, { process_status: status })
  if (selectedItem.value?.aftersale_id === item.aftersale_id) selectedItem.value = { ...selectedItem.value, ...data }
  await load()
}

function applyFilter() {
  page.value = 1
  load()
}

function selectItem(item: AfterSale & Record<string, any>) {
  selectedItem.value = item
}

function changePage(p: number) { page.value = p; load() }
function formatDate(value: string) { return value ? new Date(value).toLocaleString('zh-CN') : '-' }
function formatMoney(value: number) { return value ? `¥${Number(value).toLocaleString()}` : '-' }

const pageStats = computed(() => {
  const pending = items.value.filter((item) => item.process_status === '待处理').length
  const processing = items.value.filter((item) => item.process_status === '处理中').length
  const highRisk = items.value.filter((item) => ['高', '严重'].includes(String(item.complaint_level))).length
  const refund = items.value.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0)
  return [
    { label: '待处理', value: pending, hint: '需优先分派' },
    { label: '处理中', value: processing, hint: '跟踪处理进度' },
    { label: '高风险投诉', value: highRisk, hint: '高等级投诉' },
    { label: '本页退款额', value: formatMoney(refund), hint: '当前筛选页合计' },
  ]
})

function levelClass(level: string) {
  if (['高', '严重'].includes(level)) return 'level-high'
  if (level === '中') return 'level-mid'
  return 'level-low'
}

onMounted(() => load())

const columns = [
  { key: 'nickname', label: '用户', width: '13%' },
  { key: 'aftersale_type', label: '售后类型', width: '7%' },
  { key: 'problem_description', label: '问题描述', width: '21%' },
  { key: 'refund_amount', label: '退款金额', width: '10%' },
  { key: 'complaint_level', label: '投诉等级', width: '7%' },
  { key: 'process_status', label: '处理状态', width: '12%' },
  { key: 'create_time', label: '创建时间', width: '14%' },
  { key: 'actions', label: '操作', sortable: false, width: '16%' },
]
</script>

<template>
  <PageHeader title="售后工单" subtitle="售后处理、投诉分级与退款跟踪" />
  <div class="page-body aftersale-page">
    <section class="aftersale-summary">
      <div v-for="item in pageStats" :key="item.label" class="summary-tile">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </div>
    </section>

    <div class="toolbar">
      <select v-model="statusFilter" class="form-select" style="width:auto;" @change="applyFilter">
        <option value="">全部状态</option>
        <option value="待处理">待处理</option>
        <option value="处理中">处理中</option>
        <option value="已完成">已完成</option>
        <option value="已关闭">已关闭</option>
      </select>
      <select v-model="typeFilter" class="form-select" style="width:auto;" @change="applyFilter">
        <option value="">全部类型</option>
        <option value="退款">退款</option>
        <option value="退货">退货</option>
        <option value="换货">换货</option>
        <option value="投诉">投诉</option>
      </select>
      <select v-model="levelFilter" class="form-select" style="width:auto;" @change="applyFilter">
        <option value="">全部等级</option>
        <option value="低">低</option>
        <option value="中">中</option>
        <option value="高">高</option>
        <option value="严重">严重</option>
      </select>
      <button class="btn" @click="load()">刷新</button>
    </div>

    <div class="aftersale-layout">
      <div class="card">
        <div class="card-header"><span class="card-title">工单列表</span></div>
        <div class="card-divider"></div>
        <div class="card-body">
          <DataTable :columns="columns" :data="items" :loading="loading" @row-click="selectItem" @sort-change="handleSortChange">
            <template #cell-problem_description="{ value }">
              <span class="problem-cell">{{ value }}</span>
            </template>
            <template #cell-refund_amount="{ value }">{{ formatMoney(value) }}</template>
            <template #cell-complaint_level="{ value }">
              <span class="complaint-chip" :class="levelClass(value)">{{ value }}</span>
            </template>
            <template #cell-process_status="{ value }">
              <StatusBadge :status="value" />
            </template>
            <template #cell-create_time="{ value }">{{ formatDate(value) }}</template>
            <template #cell-actions="{ row }">
              <div class="actions-cell">
                <button v-if="row.process_status === '待处理'" class="btn small primary" @click.stop="updateStatus(row, '处理中')">处理</button>
                <button v-if="row.process_status === '处理中'" class="btn small primary" @click.stop="updateStatus(row, '已完成')">完成</button>
                <button v-if="row.process_status === '待处理' || row.process_status === '处理中'" class="btn small" @click.stop="updateStatus(row, '已关闭')">关闭</button>
              </div>
            </template>
          </DataTable>
        </div>
      </div>

      <aside v-if="selectedItem" class="card detail-panel">
        <div class="card-header"><span class="card-title">工单详情</span></div>
        <div class="card-divider"></div>
        <div class="card-body">
          <div class="detail-hero">
            <span>{{ selectedItem.aftersale_type }} / {{ selectedItem.complaint_level }}</span>
            <strong>{{ selectedItem.nickname }}</strong>
            <small>订单 {{ selectedItem.order_id }} · {{ formatDate(selectedItem.create_time) }}</small>
          </div>
          <div class="detail-grid">
            <div><span>订单金额</span><strong>{{ formatMoney(selectedItem.order_amount) }}</strong></div>
            <div><span>退款金额</span><strong>{{ formatMoney(selectedItem.refund_amount) }}</strong></div>
            <div><span>当前状态</span><strong>{{ selectedItem.process_status }}</strong></div>
          </div>
          <div class="detail-section">
            <div class="section-title">问题描述</div>
            <p>{{ selectedItem.problem_description }}</p>
          </div>
          <div class="detail-section">
            <div class="section-title">处理建议</div>
            <ol>
              <li>先核对订单、SKU、退款金额与用户历史投诉记录。</li>
              <li>高等级投诉优先电话或私信跟进，并保留处理说明。</li>
              <li>完成后回流售后原因，用于商品质量和话术风险复盘。</li>
            </ol>
          </div>
        </div>
      </aside>
    </div>

    <Pagination v-if="total > pageSize" :page="page" :total="total" :page-size="pageSize" @change="changePage" />
  </div>
</template>

<style scoped>
.aftersale-page {
  display: grid;
  gap: 20px;
}

.aftersale-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.summary-tile {
  border: 1px solid var(--rule-soft);
  background: var(--paper-dark);
  padding: 16px;
  display: grid;
  gap: 5px;
}

.summary-tile span,
.summary-tile small {
  color: var(--ink-soft);
  font-size: 12px;
}

.summary-tile strong {
  font-family: var(--font-serif);
  font-size: 26px;
  line-height: 1;
}

.aftersale-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.42fr);
  gap: 20px;
  align-items: start;
}

.actions-cell {
  display: flex; gap: 8px; white-space: nowrap;
}

.problem-cell {
  display: inline-block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.complaint-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  padding: 2px 8px;
  border: 1px solid var(--rule);
  font-size: 12px;
  font-weight: 700;
}

.level-high { color: var(--vermillion); background: var(--vermillion-soft); border-color: rgba(196, 30, 58, 0.35); }
.level-mid { color: var(--warning); background: var(--warning-soft); border-color: rgba(184, 92, 26, 0.35); }
.level-low { color: var(--success); background: var(--success-soft); border-color: rgba(45, 106, 79, 0.3); }

.detail-panel {
  position: sticky;
  top: 20px;
}

.detail-hero {
  border-left: 4px solid var(--vermillion);
  background: var(--paper);
  padding: 14px;
  display: grid;
  gap: 5px;
}

.detail-hero span,
.detail-hero small,
.detail-grid span {
  color: var(--ink-soft);
  font-size: 12px;
}

.detail-hero strong {
  font-size: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin: 14px 0;
}

.detail-grid div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--rule-soft);
  padding: 10px 12px;
}

.detail-section {
  border-top: 1px solid var(--rule-soft);
  padding-top: 14px;
  margin-top: 14px;
}

.section-title {
  font-weight: 700;
  margin-bottom: 8px;
}

.detail-section p,
.detail-section ol {
  color: var(--ink-mid);
  line-height: 1.75;
  font-size: 13px;
}

.detail-section ol {
  padding-left: 18px;
}

@media (max-width: 1100px) {
  .aftersale-summary,
  .aftersale-layout {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    position: static;
  }
}
</style>
