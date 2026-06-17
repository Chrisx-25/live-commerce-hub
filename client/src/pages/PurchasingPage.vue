<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { purchasesAPI, suppliersAPI, productsAPI } from '../api'
import type { PurchaseOrder, Supplier, Product } from '../types'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DataTable from '../components/DataTable.vue'
import Pagination from '../components/Pagination.vue'

const route = useRoute()
const purchases = ref<(PurchaseOrder & Record<string, any>)[]>([])
const suggestions = ref<any[]>([])
const suppliers = ref<Supplier[]>([])
const products = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const statusFilter = ref('')
const search = ref('')
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
const loading = ref(false)
const showSuggestions = ref(false)

const statusFlow = ['待审核', '已审核', '已发货', '已入库', '已完成']

// Suggestions pagination
const sugTotal = ref(0)
const sugPage = ref(1)
const sugPageSize = 20

// Detail modal
const showDetail = ref(false)
const detailItem = ref<any>(null)

function statusIdx(status: string) { return statusFlow.indexOf(status) }

function openDetail(row: any) {
  detailItem.value = row
  showDetail.value = true
}

async function advanceStatus() {
  if (!detailItem.value) return
  const next = nextStatus(detailItem.value.purchase_status)
  if (!next) return
  await purchasesAPI.updateStatus(detailItem.value.purchase_id, next)
  detailItem.value.purchase_status = next
  await load()
}

async function removeDetail() {
  if (!detailItem.value) return
  await purchasesAPI.delete(detailItem.value.purchase_id)
  showDetail.value = false
  detailItem.value = null
  await load()
}

// Create modal
const showCreate = ref(false)
const showNewProduct = ref(false)
const form = ref({ supplier_id: '', sku_id: '', purchase_quantity: 0, purchase_price: 0, purchase_status: '待审核', expected_arrival_time: '' })
const newProductForm = ref({
  product_name: '',
  category: '',
  brand: '',
  supplier_id: '',
  sku_name: '',
  specification: '标准规格',
  cost_price: 0,
  sale_price: 0,
  purchase_quantity: 100,
  purchase_price: 0,
  warehouse_name: '主仓',
  safety_stock: 30,
  warning_threshold: 50,
  expected_arrival_time: '',
  selling_points: '',
})
const selectedProductId = ref('')
const productSkus = ref<any[]>([])

const totalPrice = computed(() => (form.value.purchase_quantity || 0) * (form.value.purchase_price || 0))
const newProductTotalPrice = computed(() => (newProductForm.value.purchase_quantity || 0) * (newProductForm.value.purchase_price || 0))

async function onProductChange() {
  form.value.sku_id = ''
  form.value.purchase_price = 0
  form.value.supplier_id = ''
  productSkus.value = []
  if (!selectedProductId.value) return
  try {
    const { data } = await productsAPI.skus(selectedProductId.value)
    productSkus.value = data
  } catch {}
}

async function onSkuChange() {
  const sku = productSkus.value.find(s => s.sku_id === form.value.sku_id)
  if (sku) {
    form.value.purchase_price = sku.cost_price || 0
    form.value.supplier_id = sku.supplier_id || ''
  }
}

function defaultArrival() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0]
}

async function openCreate(suggestion?: any) {
  selectedProductId.value = ''
  productSkus.value = []
  form.value.expected_arrival_time = defaultArrival()

  if (suggestion) {
    const p = products.value.find(p => p.product_name === suggestion.product_name)
    if (p) {
      selectedProductId.value = p.product_id
      await onProductChange()
    }
    form.value.sku_id = suggestion.sku_id || ''
    form.value.purchase_quantity = suggestion.suggested_quantity || 0
    form.value.purchase_price = 0
    form.value.supplier_id = suggestion.supplier_id || ''
    const sku = productSkus.value.find(s => s.sku_id === form.value.sku_id)
    if (sku) {
      form.value.purchase_price = sku.cost_price || 0
      form.value.supplier_id = form.value.supplier_id || sku.supplier_id || ''
      if (!form.value.purchase_quantity) {
        form.value.purchase_quantity = (sku.warning_threshold || 0) * 2 || 10
      }
    }
  } else {
    form.value = { supplier_id: '', sku_id: '', purchase_quantity: 0, purchase_price: 0, purchase_status: '待审核', expected_arrival_time: defaultArrival() }
  }
  form.value.purchase_status = '待审核'
  showCreate.value = true
}

async function saveCreate() {
  try {
    await purchasesAPI.create(form.value)
    showCreate.value = false
    await load()
    showSuggestions.value = false
  } catch (e: any) { alert(e.response?.data?.message || '保存失败') }
}

function openNewProductPurchase() {
  newProductForm.value = {
    product_name: '',
    category: '',
    brand: '新品候选',
    supplier_id: suppliers.value[0]?.supplier_id || '',
    sku_name: '',
    specification: '标准规格',
    cost_price: 0,
    sale_price: 0,
    purchase_quantity: 100,
    purchase_price: 0,
    warehouse_name: '主仓',
    safety_stock: 30,
    warning_threshold: 50,
    expected_arrival_time: defaultArrival(),
    selling_points: '',
  }
  showNewProduct.value = true
}

async function saveNewProductPurchase() {
  try {
    const payload = {
      ...newProductForm.value,
      sku_name: newProductForm.value.sku_name || `${newProductForm.value.product_name} 默认SKU`,
      purchase_price: newProductForm.value.purchase_price || newProductForm.value.cost_price,
    }
    await purchasesAPI.createNewProduct(payload)
    showNewProduct.value = false
    await load()
  } catch (e: any) { alert(e.response?.data?.message || '新品采购保存失败') }
}

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
    const { data } = await purchasesAPI.list({ page: page.value, pageSize, status: statusFilter.value, search: search.value, sortBy: sortBy.value, sortDir: sortDir.value })
    purchases.value = data.data
    total.value = data.total
  } finally { loading.value = false }
}

async function loadSuppliers() {
  const { data } = await suppliersAPI.list({ pageSize: 100 })
  suppliers.value = data.data
}

async function loadProducts() {
  const { data } = await productsAPI.list({ pageSize: 1000 })
  products.value = data.data
}

async function loadSuggestions() {
  showSuggestions.value = !showSuggestions.value
  if (showSuggestions.value) {
    sugPage.value = 1
    await fetchSuggestions()
  }
}

async function fetchSuggestions() {
  const { data } = await purchasesAPI.suggestions({ page: sugPage.value, pageSize: sugPageSize })
  suggestions.value = data.data
  sugTotal.value = data.total
}

function changeSugPage(p: number) { sugPage.value = p; fetchSuggestions() }

function nextStatus(current: string) {
  const idx = statusFlow.indexOf(current)
  if (idx < 0 || idx >= statusFlow.length - 1) return null
  return statusFlow[idx + 1]
}

function formatDate(d: string) { return d ? d.split('T')[0] : '-' }

function changePage(p: number) { page.value = p; load() }

onMounted(async () => {
  load()
  loadSuppliers()
  await loadProducts()
  if (route.query.sku_id) {
    // Fetch purchase suggestions to get the correct suggested_quantity for this SKU
    const { data } = await purchasesAPI.suggestions({ pageSize: 500 })
    const sug = data.data.find((s: any) => s.sku_id === route.query.sku_id)
    openCreate({
      sku_id: route.query.sku_id,
      product_name: route.query.product_name,
      suggested_quantity: sug?.suggested_quantity || 0,
      supplier_id: sug?.supplier_id || '',
    })
  }
})

const columns = [
  { key: 'product_name', label: '商品', width: '24%' },
  { key: 'sku_name', label: 'SKU', width: '20%' },
  { key: 'supplier_name', label: '供应商', width: '14%' },
  { key: 'purchase_quantity', label: '数量', width: '8%' },
  { key: 'purchase_price', label: '采购价', width: '8%' },
  { key: 'purchase_status', label: '状态', width: '10%' },
  { key: 'expected_arrival_time', label: '预计到货', width: '16%' },
]

const sugColumns = [
  { key: 'product_name', label: '商品', width: '20%' },
  { key: 'sku_name', label: 'SKU', width: '18%' },
  { key: 'warehouse_name', label: '仓库', width: '12%' },
  { key: 'current_stock', label: '当前库存', width: '10%' },
  { key: 'safety_stock', label: '安全库存', width: '10%' },
  { key: 'suggested_quantity', label: '建议采购', width: '10%' },
  { key: 'stock_risk_level', label: '风险等级', width: '10%' },
]
</script>

<template>
  <PageHeader title="采购管理" subtitle="采购单管理与智能建议" />
  <div class="page-body">
    <div class="toolbar">
      <input v-model="search" class="input" placeholder="搜索商品名称..." @keyup.enter="doSearch()" style="width:200px;" />
      <button class="btn" @click="doSearch()">搜索</button>
      <select v-model="statusFilter" class="form-select" style="width:auto;" @change="load()">
        <option value="">全部状态</option>
        <option v-for="s in statusFlow" :key="s" :value="s">{{ s }}</option>
      </select>
      <button class="btn" :class="{ primary: showSuggestions }" @click="loadSuggestions">
        {{ showSuggestions ? '隐藏建议' : '采购建议' }}
      </button>
      <button class="btn primary" @click="openCreate()">+ 新增采购单</button>
      <button class="btn" @click="openNewProductPurchase()">新增新品采购</button>
      <button class="btn" @click="load()">刷新</button>
    </div>

    <!-- Suggestions -->
    <div v-if="showSuggestions" class="card" style="margin-bottom:24px;">
      <div class="card-header">
        <span class="card-title">智能采购建议 ({{ sugTotal }} 条)</span>
      </div>
      <div class="card-divider"></div>
      <div class="card-body">
        <DataTable :columns="sugColumns" :data="suggestions" @row-click="openCreate">
          <template #cell-current_stock="{ value }">
            <span :style="{ color: 'var(--vermillion)', fontWeight: '600' }">{{ value }}</span>
          </template>
          <template #cell-suggested_quantity="{ value }">
            <span style="font-weight:600;">{{ value }}</span>
          </template>
          <template #cell-stock_risk_level="{ value }">
            <StatusBadge :status="value" :type="value === '高' ? 'danger' : value === '中' ? 'warning' : 'info'" />
          </template>
        </DataTable>
        <Pagination v-if="sugTotal > sugPageSize" :page="sugPage" :total="sugTotal" :page-size="sugPageSize" @change="changeSugPage" />
      </div>
    </div>

    <!-- Main table -->
    <DataTable :columns="columns" :data="purchases" :loading="loading" @row-click="openDetail" @sort-change="handleSortChange">
      <template #cell-product_name="{ value }">
        <span style="font-weight:600;">{{ value }}</span>
      </template>
      <template #cell-purchase_price="{ value }">¥{{ value }}</template>
      <template #cell-purchase_status="{ value }">
        <StatusBadge :status="value" />
      </template>
      <template #cell-expected_arrival_time="{ value }">{{ formatDate(value) }}</template>
    </DataTable>

    <Pagination v-if="total > pageSize" :page="page" :total="total" :page-size="pageSize" @change="changePage" />

    <!-- Detail Modal -->
    <div v-if="showDetail && detailItem" class="modal-overlay" @click.self="showDetail = false">
      <div class="modal" style="min-width:560px;max-width:640px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">采购单详情</span>
          <span class="modal-close" @click="showDetail = false">&times;</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-bottom:24px;">
          <div class="detail-row"><span class="detail-label">商品</span><span class="detail-val">{{ detailItem.product_name }}</span></div>
          <div class="detail-row"><span class="detail-label">SKU</span><span class="detail-val">{{ detailItem.sku_name }}</span></div>
          <div class="detail-row"><span class="detail-label">供应商</span><span class="detail-val">{{ detailItem.supplier_name }}</span></div>
          <div class="detail-row"><span class="detail-label">数量</span><span class="detail-val">{{ detailItem.purchase_quantity }}</span></div>
          <div class="detail-row"><span class="detail-label">采购价</span><span class="detail-val">¥{{ detailItem.purchase_price }}</span></div>
          <div class="detail-row"><span class="detail-label">预计到货</span><span class="detail-val">{{ formatDate(detailItem.expected_arrival_time) }}</span></div>
        </div>

        <div class="timeline-section">
          <div class="timeline-title">状态流转</div>
          <div class="timeline">
            <template v-for="(s, i) in statusFlow" :key="s">
              <div class="tl-step" :class="{ done: i <= statusIdx(detailItem.purchase_status), active: i === statusIdx(detailItem.purchase_status) }">
                <div class="tl-dot">
                  <span v-if="i < statusIdx(detailItem.purchase_status)">&#10003;</span>
                </div>
                <div class="tl-label">{{ s }}</div>
              </div>
              <div v-if="i < statusFlow.length - 1" class="tl-line" :class="{ done: i < statusIdx(detailItem.purchase_status) }"></div>
            </template>
          </div>
        </div>

        <div class="form-actions" style="margin-top:24px;">
          <button v-if="nextStatus(detailItem.purchase_status)" class="btn primary" @click="advanceStatus">
            推进到 {{ nextStatus(detailItem.purchase_status) }}
          </button>
          <button class="btn danger" @click="removeDetail">删除采购单</button>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal" style="min-width:520px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">新增采购单</span>
          <span class="modal-close" @click="showCreate = false">&times;</span>
        </div>

        <div class="form-group">
          <label class="form-label">选择商品</label>
          <select v-model="selectedProductId" class="form-select" @change="onProductChange()">
            <option value="">请选择商品</option>
            <option v-for="p in products" :key="p.product_id" :value="p.product_id">{{ p.product_name }} ({{ p.category }})</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">选择SKU</label>
          <select v-model="form.sku_id" class="form-select" @change="onSkuChange()" :disabled="!selectedProductId">
            <option value="">{{ selectedProductId ? '请选择SKU' : '请先选择商品' }}</option>
            <option v-for="s in productSkus" :key="s.sku_id" :value="s.sku_id">
              {{ s.sku_name }} · 成本 ¥{{ s.cost_price }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">供应商</label>
          <select v-model="form.supplier_id" class="form-select">
            <option value="">请选择</option>
            <option v-for="s in suppliers" :key="s.supplier_id" :value="s.supplier_id">{{ s.supplier_name }}</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">采购数量</label>
            <input v-model.number="form.purchase_quantity" type="number" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">采购价 (成本价自动填入)</label>
            <input v-model.number="form.purchase_price" type="number" step="0.01" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">总价</label>
          <div class="total-price-display">¥{{ totalPrice.toLocaleString() }}</div>
        </div>
        <div class="form-group">
          <label class="form-label">预计到货 (自动估算7天后)</label>
          <input v-model="form.expected_arrival_time" type="date" class="form-input" />
        </div>
        <div class="form-actions">
          <button class="btn" @click="showCreate = false">取消</button>
          <button class="btn primary" @click="saveCreate">保存</button>
        </div>
      </div>
    </div>

    <!-- New Product Purchase Modal -->
    <div v-if="showNewProduct" class="modal-overlay" @click.self="showNewProduct = false">
      <div class="modal" style="min-width:680px;max-width:760px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">新增新品采购</span>
          <span class="modal-close" @click="showNewProduct = false">&times;</span>
        </div>
        <div class="new-product-note">
          用于采购系统中尚不存在的新品。保存后会创建“待评估”商品、默认 SKU、主仓库存记录和待审核采购单。
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">新品名称</label>
            <input v-model="newProductForm.product_name" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">品类</label>
            <input v-model="newProductForm.category" class="form-input" placeholder="如 美妆 / 数码 / 食品饮料" />
          </div>
          <div class="form-group">
            <label class="form-label">品牌</label>
            <input v-model="newProductForm.brand" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">供应商</label>
            <select v-model="newProductForm.supplier_id" class="form-select">
              <option value="">请选择</option>
              <option v-for="s in suppliers" :key="s.supplier_id" :value="s.supplier_id">{{ s.supplier_name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">SKU 名称</label>
            <input v-model="newProductForm.sku_name" class="form-input" placeholder="为空时自动生成默认SKU" />
          </div>
          <div class="form-group">
            <label class="form-label">规格</label>
            <input v-model="newProductForm.specification" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">成本价</label>
            <input v-model.number="newProductForm.cost_price" type="number" step="0.01" class="form-input" @change="newProductForm.purchase_price = newProductForm.purchase_price || newProductForm.cost_price" />
          </div>
          <div class="form-group">
            <label class="form-label">建议售价</label>
            <input v-model.number="newProductForm.sale_price" type="number" step="0.01" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">采购数量</label>
            <input v-model.number="newProductForm.purchase_quantity" type="number" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">采购价</label>
            <input v-model.number="newProductForm.purchase_price" type="number" step="0.01" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">安全库存</label>
            <input v-model.number="newProductForm.safety_stock" type="number" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">预警阈值</label>
            <input v-model.number="newProductForm.warning_threshold" type="number" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">仓库</label>
            <input v-model="newProductForm.warehouse_name" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">预计到货</label>
            <input v-model="newProductForm.expected_arrival_time" type="date" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">卖点/采购理由</label>
          <textarea v-model="newProductForm.selling_points" class="form-input" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">采购总价</label>
          <div class="total-price-display">¥{{ newProductTotalPrice.toLocaleString() }}</div>
        </div>
        <div class="form-actions">
          <button class="btn" @click="showNewProduct = false">取消</button>
          <button class="btn primary" @click="saveNewProductPurchase">创建新品与采购单</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-row {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; padding: 4px 0;
}
.detail-label {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-soft); letter-spacing: 0.05em; min-width: 54px;
}
.detail-val { color: var(--ink-mid); }

.timeline-section {
  border-top: 1px solid var(--rule-soft);
  padding-top: 20px;
}
.timeline-title {
  font-family: var(--font-serif); font-size: 14px; font-weight: 700;
  margin-bottom: 20px;
}
.timeline {
  display: flex; align-items: flex-start; justify-content: center;
  gap: 0;
}
.tl-step {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; min-width: 60px;
}
.tl-dot {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid var(--rule);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: transparent;
  background: var(--paper);
  transition: all var(--duration-fast);
}
.tl-step.done .tl-dot {
  background: var(--ink); border-color: var(--ink);
  color: var(--paper);
}
.tl-step.active .tl-dot {
  border-color: var(--vermillion);
  box-shadow: 0 0 0 3px rgba(196, 30, 58, 0.18);
}
.tl-label {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-soft); letter-spacing: 0.04em;
  white-space: nowrap;
}
.tl-step.done .tl-label { color: var(--ink); font-weight: 600; }
.tl-step.active .tl-label { color: var(--vermillion); font-weight: 700; }

.tl-line {
  flex: 1; height: 2px; background: var(--rule-soft);
  margin-top: 13px; min-width: 28px;
  transition: background var(--duration-fast);
}
.tl-line.done { background: var(--ink); }

.modal-close {
  font-family: var(--font-serif); font-size: 28px; line-height: 1;
  color: var(--ink-soft); cursor: pointer;
  padding: 0 4px; transition: color var(--duration-fast);
}
.modal-close:hover { color: var(--vermillion); }

.total-price-display {
  padding: 10px 12px;
  background: var(--paper-dark);
  border: 1px solid var(--rule);
  font-family: var(--font-serif);
  font-size: 22px; font-weight: 900;
  color: var(--vermillion);
}

.new-product-note {
  border-left: 4px solid var(--vermillion);
  background: var(--paper-dark);
  padding: 12px;
  margin-bottom: 16px;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.6;
}
</style>
