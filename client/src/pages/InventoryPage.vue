<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { inventoryAPI, purchasesAPI } from '../api'
import type { Inventory } from '../types'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DataTable from '../components/DataTable.vue'
import Pagination from '../components/Pagination.vue'

const router = useRouter()
const items = ref<(Inventory & Record<string, any>)[]>([])
const alerts = ref<(Inventory & Record<string, any>)[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const statusFilter = ref('')
const search = ref('')
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
const loading = ref(false)
const showAlerts = ref(false)
const showQuickPurchase = ref(false)
const selectedInventory = ref<any>(null)
const quickForm = ref({ purchase_quantity: 0, purchase_price: 0, expected_arrival_time: '' })
const batchPurchasing = ref(false)
const showBatchConfirm = ref(false)
const batchResult = ref<{ created: number; skipped: number } | null>(null)

const alertTotal = ref(0)
const alertPage = ref(1)
const alertPageSize = 20

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
  loading.value = true
  try {
    const { data } = await inventoryAPI.list({ page: page.value, pageSize, status: statusFilter.value, search: search.value, sortBy: sortBy.value, sortDir: sortDir.value })
    items.value = data.data
    total.value = data.total
  } finally { loading.value = false }
}

async function loadAlerts() {
  showAlerts.value = !showAlerts.value
  if (showAlerts.value) {
    alertPage.value = 1
    await fetchAlerts()
  }
}

async function fetchAlerts() {
  const { data } = await inventoryAPI.alerts({ page: alertPage.value, pageSize: alertPageSize })
  alerts.value = data.data
  alertTotal.value = data.total
}

function changePage(p: number) { page.value = p; load() }
function changeAlertPage(p: number) { alertPage.value = p; fetchAlerts() }

function goToPurchase(row: any) {
  router.push({ path: '/purchasing', query: { sku_id: row.sku_id, product_name: row.product_name } })
}

function defaultArrival(days = 7) {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(days, 1))
  return d.toISOString().split('T')[0]
}

function openQuickPurchase(row: any) {
  selectedInventory.value = row
  quickForm.value = {
    purchase_quantity: row.suggested_quantity || Math.max(row.safety_stock * 2, 10),
    purchase_price: Number(row.cost_price) || 0,
    expected_arrival_time: defaultArrival(row.delivery_cycle || 7),
  }
  showQuickPurchase.value = true
}

async function saveQuickPurchase() {
  if (!selectedInventory.value) return
  await purchasesAPI.create({
    supplier_id: selectedInventory.value.supplier_id,
    sku_id: selectedInventory.value.sku_id,
    purchase_quantity: quickForm.value.purchase_quantity,
    purchase_price: quickForm.value.purchase_price,
    purchase_status: '待审核',
    expected_arrival_time: quickForm.value.expected_arrival_time,
  })
  showQuickPurchase.value = false
  selectedInventory.value = null
  await load()
  if (showAlerts.value) await fetchAlerts()
}

function openBatchConfirm() {
  showBatchConfirm.value = true
}

async function batchPurchaseAll() {
  if (batchPurchasing.value) return
  showBatchConfirm.value = false
  batchPurchasing.value = true
  try {
    const { data } = await inventoryAPI.batchPurchase()
    batchResult.value = data
    await load()
    if (showAlerts.value) await fetchAlerts()
  } catch (e: any) {
    alert(e.response?.data?.message || '批量采购失败')
  } finally {
    batchPurchasing.value = false
  }
}

function riskType(level: string) {
  if (level === '高') return 'danger'
  if (level === '中') return 'warning'
  return 'success'
}

const riskSummary = computed(() => {
  const urgent = items.value.filter((item) => item.stock_risk_level === '高').length
  const live = items.value.filter((item) => (item.upcoming_live_demand || 0) > 0).length
  const inbound = items.value.reduce((sum, item) => sum + Number(item.inbound_purchase_quantity || 0), 0)
  const suggested = items.value.reduce((sum, item) => sum + Number(item.suggested_quantity || 0), 0)
  return { urgent, live, inbound, suggested }
})

onMounted(() => load())

const columns = [
  { key: 'product_name', label: '商品名称', width: '20%' },
  { key: 'sku_name', label: 'SKU', width: '16%' },
  { key: 'warehouse_name', label: '仓库', width: '10%' },
  { key: 'current_stock', label: '当前库存', width: '8%' },
  { key: 'predicted_sales_30d', label: '30天预测', width: '8%' },
  { key: 'upcoming_live_demand', label: '直播需求', width: '8%' },
  { key: 'inbound_purchase_quantity', label: '在途', width: '6%' },
  { key: 'suggested_quantity', label: '建议采购', width: '8%' },
  { key: 'stock_risk_level', label: '风险', width: '6%' },
  { key: 'actions', label: '操作', sortable: false, width: '10%' },
]

const alertColumns = [
  { key: 'product_name', label: '商品', width: '20%' },
  { key: 'sku_name', label: 'SKU', width: '16%' },
  { key: 'warehouse_name', label: '仓库', width: '10%' },
  { key: 'current_stock', label: '当前库存', width: '8%' },
  { key: 'safety_stock', label: '安全库存', width: '8%' },
  { key: 'reorder_point', label: '动态补货点', width: '10%' },
  { key: 'suggested_quantity', label: '建议采购', width: '8%' },
  { key: 'stock_risk_level', label: '风险', width: '6%' },
  { key: 'actions', label: '操作', sortable: false, width: '10%' },
]
</script>

<template>
  <PageHeader title="库存管理" subtitle="库存预警与仓库管理" />
  <div class="page-body">
    <div class="toolbar">
      <input v-model="search" class="input" placeholder="搜索商品名称..." @keyup.enter="doSearch()" style="width:200px;" />
      <button class="btn" @click="doSearch()">搜索</button>
      <select v-model="statusFilter" class="form-select" style="width:auto;" @change="load()">
        <option value="">全部状态</option>
        <option value="正常">正常</option>
        <option value="不足">不足</option>
      </select>
      <button class="btn" :class="{ primary: showAlerts }" @click="loadAlerts">
        {{ showAlerts ? '隐藏预警' : '库存预警' }}
      </button>
      <button class="btn primary" :disabled="batchPurchasing" @click="openBatchConfirm">
        {{ batchPurchasing ? '生成中...' : '一键采购' }}
      </button>
      <button class="btn" @click="load()">刷新</button>
    </div>

    <div class="inventory-summary">
      <div class="summary-item">
        <span>高风险 SKU</span>
        <strong>{{ riskSummary.urgent }}</strong>
      </div>
      <div class="summary-item">
        <span>涉及直播备货</span>
        <strong>{{ riskSummary.live }}</strong>
      </div>
      <div class="summary-item">
        <span>在途采购</span>
        <strong>{{ riskSummary.inbound }}</strong>
      </div>
      <div class="summary-item">
        <span>本页建议采购</span>
        <strong>{{ riskSummary.suggested }}</strong>
      </div>
    </div>

    <!-- Alert Section -->
    <div v-if="showAlerts" class="card" style="margin-bottom:24px;">
      <div class="card-header">
        <span class="card-title">动态库存风险清单 ({{ alertTotal }} 项)</span>
      </div>
      <div class="card-divider"></div>
      <div class="card-body">
        <DataTable :columns="alertColumns" :data="alerts" @row-click="goToPurchase">
          <template #cell-current_stock="{ value }">
            <span style="color:var(--vermillion);font-weight:600;">{{ value }}</span>
          </template>
          <template #cell-stock_risk_level="{ value }">
            <StatusBadge :status="value" :type="riskType(value)" />
          </template>
          <template #cell-suggested_quantity="{ row }">
            <span style="font-weight:700;color:var(--vermillion);">{{ row.suggested_quantity }}</span>
          </template>
          <template #cell-actions="{ row }">
            <button class="btn small primary" :disabled="!row.supplier_id || !row.suggested_quantity" @click.stop="openQuickPurchase(row)">
              采购
            </button>
          </template>
        </DataTable>
        <div v-if="alerts.length === 0" style="padding:20px;color:var(--success);">所有库存正常</div>
        <Pagination v-if="alertTotal > alertPageSize" :page="alertPage" :total="alertTotal" :page-size="alertPageSize" @change="changeAlertPage" />
      </div>
    </div>

    <!-- Main Inventory Table -->
    <DataTable :columns="columns" :data="items" :loading="loading" @sort-change="handleSortChange">
      <template #cell-current_stock="{ row }">
        <span :style="{ color: row.stock_risk_level === '高' ? 'var(--vermillion)' : 'var(--ink)', fontWeight: row.stock_risk_level === '高' ? '600' : '400' }">
          {{ row.current_stock }}
        </span>
      </template>
      <template #cell-suggested_quantity="{ row }">
        <span :style="{ fontWeight: row.suggested_quantity > 0 ? 700 : 400, color: row.suggested_quantity > 0 ? 'var(--vermillion)' : 'var(--ink-soft)' }">
          {{ row.suggested_quantity }}
        </span>
      </template>
      <template #cell-stock_risk_level="{ value }">
        <StatusBadge :status="value" :type="riskType(value)" />
      </template>
      <template #cell-actions="{ row }">
        <button class="btn small primary" :disabled="!row.supplier_id || !row.suggested_quantity" @click.stop="openQuickPurchase(row)">
          采购
        </button>
      </template>
    </DataTable>

    <Pagination v-if="total > pageSize" :page="page" :total="total" :page-size="pageSize" @change="changePage" />

    <div v-if="showQuickPurchase && selectedInventory" class="modal-overlay" @click.self="showQuickPurchase = false">
      <div class="modal" style="min-width:560px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">快速采购</span>
          <span class="modal-close" @click="showQuickPurchase = false">&times;</span>
        </div>
        <div class="purchase-context">
          <div><span>商品</span><strong>{{ selectedInventory.product_name }}</strong></div>
          <div><span>SKU</span><strong>{{ selectedInventory.sku_name }}</strong></div>
          <div><span>供应商</span><strong>{{ selectedInventory.supplier_name }}</strong></div>
          <div><span>风险</span><strong>{{ selectedInventory.stock_risk_level }}</strong></div>
        </div>
        <div class="reason-box">{{ selectedInventory.suggestion_reason }}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">采购数量（默认推荐值，可修改）</label>
            <input v-model.number="quickForm.purchase_quantity" type="number" min="1" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">采购价</label>
            <input v-model.number="quickForm.purchase_price" type="number" step="0.01" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">预计到货</label>
          <input v-model="quickForm.expected_arrival_time" type="date" class="form-input" />
        </div>
        <div class="form-actions">
          <button class="btn" @click="showQuickPurchase = false">取消</button>
          <button class="btn primary" @click="saveQuickPurchase">生成采购单</button>
        </div>
      </div>
    </div>

    <!-- Batch Purchase Confirm Modal -->
    <div v-if="showBatchConfirm" class="modal-overlay" @click.self="showBatchConfirm = false">
      <div class="modal" style="min-width:400px;max-width:480px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">一键采购确认</span>
          <span class="modal-close" @click="showBatchConfirm = false">&times;</span>
        </div>
        <p style="font-size:14px;color:var(--ink-mid);line-height:1.7;margin-bottom:20px;">
          将为所有<strong style="color:var(--vermillion);">建议采购数量 > 0</strong> 的商品生成采购单，确认继续？
        </p>
        <div class="form-actions">
          <button class="btn" @click="showBatchConfirm = false">取消</button>
          <button class="btn primary" @click="batchPurchaseAll">确认生成</button>
        </div>
      </div>
    </div>

    <!-- Batch Purchase Result Modal -->
    <div v-if="batchResult" class="modal-overlay" @click.self="batchResult = null">
      <div class="modal" style="min-width:360px;max-width:420px;padding-top:16px;text-align:center;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">采购完成</span>
          <span class="modal-close" @click="batchResult = null">&times;</span>
        </div>
        <p style="font-size:15px;color:var(--ink);margin-bottom:8px;">
          成功生成 <strong style="color:var(--success);font-size:22px;">{{ batchResult.created }}</strong> 张采购单
        </p>
        <p v-if="batchResult.skipped > 0" style="font-size:13px;color:var(--ink-soft);">
          跳过 {{ batchResult.skipped }} 条
        </p>
        <div class="form-actions" style="justify-content:center;margin-top:16px;">
          <button class="btn primary" @click="batchResult = null">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inventory-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-item {
  border: 1px solid var(--rule-soft);
  padding: 14px 16px;
  min-height: 76px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.summary-item span,
.purchase-context span {
  color: var(--ink-soft);
  font-size: 12px;
}

.summary-item strong {
  font-family: var(--font-serif);
  font-size: 26px;
  color: var(--vermillion);
}

.purchase-context {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 18px;
  margin-bottom: 14px;
}

.purchase-context div {
  border: 1px solid var(--rule-soft);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.purchase-context strong {
  font-size: 13px;
}

.reason-box {
  border-left: 4px solid var(--vermillion);
  background: var(--paper-dark);
  padding: 12px;
  margin-bottom: 16px;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.6;
}

.modal-close {
  font-family: var(--font-serif);
  font-size: 28px;
  line-height: 1;
  color: var(--ink-soft);
  cursor: pointer;
  padding: 0 4px;
}

.modal-close:hover {
  color: var(--vermillion);
}

.btn.small {
  padding: 5px 10px;
  font-size: 12px;
}

@media (max-width: 880px) {
  .inventory-summary,
  .purchase-context {
    grid-template-columns: 1fr;
  }
}
</style>
