<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { productsAPI, suppliersAPI } from '../api'
import type { Product, Supplier } from '../types'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DataTable from '../components/DataTable.vue'
import Pagination from '../components/Pagination.vue'

const products = ref<Product[]>([])
const suppliers = ref<Supplier[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const search = ref('')
const categoryFilter = ref('')
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
const loading = ref(false)

const showModal = ref(false)
const editing = ref<Product | null>(null)
const form = ref({
  product_name: '', category: '', brand: '', cost_price: 0,
  sale_price: 0, product_status: '在售', supplier_id: '', description: '', selling_points: '',
  is_new: false,
})

const categories = ['女装', '美妆', '箱包', '运动户外', '零食', '家居用品', '母婴', '数码', '食品饮料']
const sortOptions = [
  { label: '默认排序', value: '' },
  { label: '商品名称', value: 'product_name' },
  { label: '品牌', value: 'brand' },
  { label: '供应商', value: 'supplier_name' },
  { label: '成本价', value: 'cost_price' },
  { label: '售价', value: 'sale_price' },
  { label: '毛利率', value: 'gross_profit_rate' },
  { label: '分类', value: 'category' },
]

function doSearch() {
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const { data } = await productsAPI.list({
      page: page.value, pageSize, search: search.value,
      category: categoryFilter.value,
      sortBy: sortBy.value, sortDir: sortDir.value,
    })
    products.value = data.data
    total.value = data.total
  } finally {
    loading.value = false
  }
}

async function loadSuppliers() {
  const { data } = await suppliersAPI.list({ pageSize: 100 })
  suppliers.value = data.data
}

function toggleSort(field: string) {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortDir.value = 'asc'
  }
  page.value = 1
  load()
}

function handleSortChange(state: { key: string; direction: string } | null) {
  if (!state) return
  sortBy.value = state.key
  sortDir.value = state.direction as 'asc' | 'desc'
  page.value = 1
  load()
}

function openCreate() {
  editing.value = null
  form.value = { product_name: '', category: '', brand: '', cost_price: 0, sale_price: 0, product_status: '在售', supplier_id: '', description: '', selling_points: '', is_new: false }
  showModal.value = true
}

function openEdit(p: Product) {
  editing.value = p
  form.value = {
    product_name: p.product_name, category: p.category, brand: p.brand || '',
    cost_price: p.cost_price, sale_price: p.sale_price,
    product_status: p.product_status, supplier_id: p.supplier_id || '',
    description: p.description || '', selling_points: p.selling_points || '',
    is_new: p.product_status === '待评估',
  }
  showModal.value = true
}

async function save() {
  try {
    // 根据"是否新品"自动调整商品状态
    if (form.value.is_new) {
      form.value.product_status = '待评估'
    } else if (form.value.product_status === '待评估') {
      form.value.product_status = '在售'
    }
    // 构建提交数据，排除 is_new（数据库无此列）
    const { is_new, ...payload } = form.value
    if (editing.value) {
      await productsAPI.update(editing.value.product_id, payload)
    } else {
      await productsAPI.create(payload)
    }
    showModal.value = false
    await load()
  } catch (e: any) {
    alert(e.response?.data?.message || '保存失败')
  }
}

async function remove(p: Product) {
  if (!confirm(`确认删除商品 "${p.product_name}"？`)) return
  await productsAPI.delete(p.product_id)
  await load()
}

function changePage(p: number) {
  page.value = p
  load()
}

onMounted(() => {
  load()
  loadSuppliers()
})

const columns = [
  { key: 'product_name', label: '商品名称', width: '23%' },
  { key: 'category', label: '分类', width: '7%' },
  { key: 'brand', label: '品牌', width: '16%' },
  { key: 'supplier_name', label: '供应商', width: '16%' },
  { key: 'cost_price', label: '成本价', width: '7%' },
  { key: 'sale_price', label: '售价', width: '7%' },
  { key: 'gross_profit_rate', label: '毛利率', width: '6%' },
  { key: 'product_status', label: '状态', width: '6%' },
  { key: 'actions', label: '操作', width: '12%' },
]
</script>

<template>
  <PageHeader title="商品管理" subtitle="商品信息维护与查询" />
  <div class="page-body">
    <!-- Toolbar -->
    <div class="toolbar">
      <input v-model="search" class="input" placeholder="搜索商品名称/品牌..." @keyup.enter="doSearch()" />
      <button class="btn" @click="doSearch()">搜索</button>
      <select v-model="categoryFilter" class="form-select" style="width:140px;" @change="doSearch()">
        <option value="">全部分类</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="sortBy" class="form-select" style="width:140px;" @change="toggleSort(sortBy)">
        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <button class="btn small" v-if="sortBy" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'; load()">
        {{ sortDir === 'asc' ? '升序' : '降序' }}
      </button>
      <span style="flex:1;"></span>
      <button class="btn primary" @click="openCreate">+ 新增商品</button>
      <button class="btn" @click="load()">刷新</button>
    </div>

    <!-- Sortable column headers -->
    <DataTable :columns="columns" :data="products" :loading="loading" @sort-change="handleSortChange">
      <template #cell-product_name="{ row }">
        <span class="col-name">{{ row.product_name }}</span>
      </template>
      <template #cell-brand="{ value }">
        <span class="col-brand">{{ value || '-' }}</span>
      </template>
      <template #cell-cost_price="{ value }">
        <span class="col-num">¥{{ value }}</span>
      </template>
      <template #cell-sale_price="{ value }">
        <span class="col-num">¥{{ value }}</span>
      </template>
      <template #cell-gross_profit_rate="{ value }">
        <span class="col-num">{{ value ? value + '%' : '-' }}</span>
      </template>
      <template #cell-supplier_name="{ value }">
        <span class="col-brand">{{ value || '-' }}</span>
      </template>
      <template #cell-product_status="{ value }">
        <StatusBadge :status="value" />
      </template>
      <template #cell-actions="{ row }">
        <div class="actions-cell">
          <button class="btn small" @click="openEdit(row)">编辑</button>
          <button class="btn small danger" @click="remove(row)">删除</button>
        </div>
      </template>
    </DataTable>

    <Pagination v-if="total > pageSize" :page="page" :total="total" :page-size="pageSize" @change="changePage" />

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-title">{{ editing ? '编辑商品' : '新增商品' }}</div>
        <div class="form-group">
          <label class="form-label">商品名称</label>
          <input v-model="form.product_name" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <select v-model="form.category" class="form-select">
            <option value="">请选择</option>
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">品牌</label>
          <input v-model="form.brand" class="form-input" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">成本价</label>
            <input v-model.number="form.cost_price" type="number" step="0.01" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">售价</label>
            <input v-model.number="form.sale_price" type="number" step="0.01" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">供应商</label>
          <select v-model="form.supplier_id" class="form-select">
            <option value="">请选择</option>
            <option v-for="s in suppliers" :key="s.supplier_id" :value="s.supplier_id">{{ s.supplier_name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-checkbox-label">
            <input v-model="form.is_new" type="checkbox" />
            <span>标记为新品（用于冷启动评估）</span>
          </label>
          <span v-if="form.is_new" style="color:var(--vermillion);font-size:12px;margin-left:8px;">保存后状态将自动设为"待评估"</span>
        </div>
        <div class="form-group">
          <label class="form-label">状态</label>
          <select v-model="form.product_status" class="form-select" :disabled="form.is_new">
            <option value="在售">在售</option>
            <option value="下架">下架</option>
            <option value="待评估">待评估</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea v-model="form.description" class="form-input" rows="2" />
        </div>
        <div class="form-actions">
          <button class="btn" @click="showModal = false">取消</button>
          <button class="btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.col-name {
  font-weight: 600;
}
.col-brand {
  color: var(--ink-soft);
}
.col-num {
  font-family: var(--font-mono);
  font-size: 13px;
}
.actions-cell {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}
.form-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink-default);
}
.form-checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--vermillion);
}
</style>
