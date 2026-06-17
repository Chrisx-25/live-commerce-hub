<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { scriptsAPI, productsAPI } from '../api'
import type { Script, Product } from '../types'
import PageHeader from '../components/PageHeader.vue'
import DataTable from '../components/DataTable.vue'
import Pagination from '../components/Pagination.vue'

const scripts = ref<(Script & Record<string, any>)[]>([])
const products = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const search = ref('')
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')

// Generate modal
const showGenerate = ref(false)
const genForm = ref({ productId: '', scriptType: '讲解', style: '专业' })
const generating = ref(false)
const generatedResult = ref<any>(null)
const productSearch = ref('')
const genCategory = ref('')
const showProductDropdown = ref(false)

const selectedProductName = computed(() => {
  const p = products.value.find(p => p.product_id === genForm.value.productId)
  return p ? `${p.product_name} — ${p.category} — ¥${p.sale_price}` : ''
})

function selectProduct(id: string) {
  genForm.value.productId = id
  showProductDropdown.value = false
}

function toggleDropdown() {
  showProductDropdown.value = !showProductDropdown.value
}

// Edit modal
const showEdit = ref(false)
const editing = ref<Script | null>(null)
const editForm = ref({ script_title: '', script_content: '' })

// Confirm dialog
const showConfirm = ref(false)
const confirmTarget = ref<Script | null>(null)

function confirmDelete(s: Script) {
  confirmTarget.value = s
  showConfirm.value = true
}

async function doDelete() {
  if (!confirmTarget.value) return
  try {
    await scriptsAPI.delete(confirmTarget.value.script_id)
    showConfirm.value = false
    confirmTarget.value = null
    await load()
  } catch (e: any) { alert('删除失败') }
}

const categories = ['女装', '美妆', '箱包', '运动户外', '零食', '家居用品', '母婴', '数码', '食品饮料']
const scriptTypes = ['全部', '开场', '讲解', '促单', '答疑', '结尾']
const styles = ['激情', '专业', '亲和']

const filteredProducts = computed(() => {
  let list = products.value
  if (genCategory.value) list = list.filter(p => p.category === genCategory.value)
  if (productSearch.value) {
    const q = productSearch.value.toLowerCase()
    list = list.filter(p =>
      p.product_name.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q))
    )
  }
  return list
})

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
    const { data } = await scriptsAPI.list({ page: page.value, pageSize, search: search.value, sortBy: sortBy.value, sortDir: sortDir.value })
    scripts.value = data.data
    total.value = data.total
  } finally { loading.value = false }
}

async function loadProducts() {
  const { data } = await productsAPI.list({ pageSize: 1000 })
  products.value = data.data
}

function openGenerate() {
  genForm.value = { productId: products.value[0]?.product_id || '', scriptType: '讲解', style: '专业' }
  generatedResult.value = null
  productSearch.value = ''
  genCategory.value = ''
  showGenerate.value = true
}

async function generate() {
  if (!genForm.value.productId) { alert('请选择商品'); return }
  generating.value = true
  generatedResult.value = null
  try {
    const { data } = await scriptsAPI.generate(genForm.value)
    generatedResult.value = data
  } catch (e: any) { alert(e.response?.data?.message || '生成失败') }
  finally { generating.value = false }
}

async function saveGenerated() {
  if (!generatedResult.value) return
  try {
    await scriptsAPI.create({
      product_id: generatedResult.value.product_id,
      script_title: generatedResult.value.script_title,
      script_content: generatedResult.value.script_content,
      script_type: generatedResult.value.script_type,
      tags: 'AI生成',
    })
    showGenerate.value = false
    await load()
  } catch (e: any) { alert('保存失败') }
}

function openEdit(s: Script) {
  editing.value = s
  editForm.value = { script_title: s.script_title, script_content: s.script_content }
  showEdit.value = true
}

async function saveEdit() {
  if (!editing.value) return
  try {
    await scriptsAPI.update(editing.value.script_id, editForm.value)
    showEdit.value = false
    await load()
  } catch (e: any) { alert('保存失败') }
}

function changePage(p: number) { page.value = p; load() }

onMounted(() => { load(); loadProducts() })

const columns = [
  { key: 'script_title', label: '脚本标题', width: '30%' },
  { key: 'product_name', label: '商品', width: '24%' },
  { key: 'script_type', label: '类型', width: '6%' },
  { key: 'tags', label: '标签', width: '10%' },
  { key: 'conversion_rate', label: '转化率', width: '6%' },
  { key: 'recommendation_level', label: '推荐', width: '5%' },
  { key: 'actions', label: '操作', width: '19%' },
]
</script>

<template>
  <PageHeader title="脚本管理" subtitle="AI 生成直播带货逐字稿" />
  <div class="page-body">
    <div class="toolbar">
      <input v-model="search" class="input" placeholder="搜索商品名称..." @keyup.enter="doSearch()" style="width:200px;" />
      <button class="btn" @click="doSearch()">搜索</button>
      <button class="btn primary" @click="openGenerate">+ AI 生成脚本</button>
      <button class="btn" @click="load()">刷新</button>
    </div>

    <DataTable :columns="columns" :data="scripts" :loading="loading" @sort-change="handleSortChange">
      <template #cell-script_title="{ value }">
        <span class="script-title-cell">{{ value }}</span>
      </template>
      <template #cell-conversion_rate="{ value }">{{ value ? value + '%' : '-' }}</template>
      <template #cell-recommendation_level="{ value }">
        <span v-if="value" class="rec-badge" :class="value === '高' ? 'rec-high' : value === '中' ? 'rec-mid' : 'rec-low'">{{ value }}</span>
        <span v-else class="rec-none">-</span>
      </template>
      <template #cell-actions="{ row }">
        <button class="btn small" @click="openEdit(row)">查看/编辑</button>
        <button class="btn small danger" style="margin-left:8px;" @click="confirmDelete(row)">删除</button>
      </template>
    </DataTable>

    <Pagination v-if="total > pageSize" :page="page" :total="total" :page-size="pageSize" @change="changePage" />

    <!-- Generate Modal -->
    <div v-if="showGenerate" class="modal-overlay" @click.self="showGenerate = false; showProductDropdown = false">
      <div class="modal" style="min-width:560px;max-width:760px;padding-top:16px;" @click="showProductDropdown = false">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">AI 智能生成直播脚本</span>
          <span class="modal-close" @click="showGenerate = false">&times;</span>
        </div>

        <!-- Category + Search filters -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">品类筛选</label>
            <select v-model="genCategory" class="form-select">
              <option value="">全部分类</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">搜索商品</label>
            <div style="display:flex;gap:8px;">
              <input v-model="productSearch" class="form-input" style="flex:1;" placeholder="商品名称或品牌..." @keyup.enter="showProductDropdown = true" />
              <button class="btn small" @click="showProductDropdown = true">搜索</button>
            </div>
          </div>
        </div>

        <!-- Custom product picker -->
        <div class="form-group" style="position:relative;">
          <label class="form-label">选择商品（共 {{ filteredProducts.length }} 件）</label>
          <div class="picker-trigger" @click.stop="toggleDropdown">
            <span v-if="selectedProductName" class="picker-text">{{ selectedProductName }}</span>
            <span v-else class="picker-placeholder">请选择商品</span>
          </div>
          <div v-if="showProductDropdown" class="picker-dropdown" @click.stop>
            <div class="picker-item" v-for="p in filteredProducts" :key="p.product_id"
                 :class="{ active: genForm.productId === p.product_id }"
                 @click="selectProduct(p.product_id)">
              <span class="picker-name">{{ p.product_name }}</span>
              <span class="picker-meta">{{ p.category }} · ¥{{ p.sale_price }}</span>
            </div>
            <div v-if="filteredProducts.length === 0" class="picker-empty">无匹配商品</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">脚本类型</label>
            <select v-model="genForm.scriptType" class="form-select">
              <option v-for="t in scriptTypes" :key="t" :value="t">{{ t === '全部' ? '全部（完整直播）' : t }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">风格</label>
            <select v-model="genForm.style" class="form-select">
              <option v-for="s in styles" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>

        <!-- Progress bar -->
        <div v-if="generating" class="progress-wrap">
          <div class="progress-bar"></div>
          <span class="progress-text">AI 正在生成脚本...</span>
        </div>

        <div class="form-actions" style="margin-bottom:16px;">
          <button class="btn" @click="showGenerate = false">取消</button>
          <button class="btn primary" @click="generate" :disabled="generating || !genForm.productId">
            {{ generating ? '生成中...' : '生成脚本' }}
          </button>
        </div>

        <!-- Generated result -->
        <div v-if="generatedResult" class="generate-result">
          <div class="generate-title">{{ generatedResult.script_title }}</div>
          <div class="generate-content">{{ generatedResult.script_content }}</div>
          <div class="form-actions" style="margin-top:16px;">
            <button class="btn primary" @click="saveGenerated">保存到列表</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Dialog -->
    <div v-if="showConfirm" class="modal-overlay" @click.self="showConfirm = false">
      <div class="modal" style="min-width:400px;max-width:440px;padding-top:16px;text-align:center;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">确认删除</span>
          <span class="modal-close" @click="showConfirm = false">&times;</span>
        </div>
        <p style="font-family:var(--font-sans);font-size:15px;color:var(--ink-mid);margin-bottom:24px;line-height:1.6;">
          确定要删除脚本<br /><strong style="color:var(--ink);">「{{ confirmTarget?.script_title }}」</strong> 吗？<br /><span style="font-size:13px;color:var(--ink-soft);">此操作不可撤销</span>
        </p>
        <div class="form-actions" style="justify-content:center;">
          <button class="btn" @click="showConfirm = false">取消</button>
          <button class="btn danger" @click="doDelete">确认删除</button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="showEdit" class="modal-overlay" @click.self="showEdit = false">
      <div class="modal" style="min-width:640px;max-width:800px;padding-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <span class="modal-title" style="margin-bottom:0;">编辑脚本</span>
          <span class="modal-close" @click="showEdit = false">&times;</span>
        </div>
        <div class="form-group">
          <label class="form-label">脚本标题</label>
          <input v-model="editForm.script_title" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">脚本内容</label>
          <textarea v-model="editForm.script_content" class="form-input" rows="16" style="resize:vertical;" />
        </div>
        <div class="form-actions">
          <button class="btn" @click="showEdit = false">取消</button>
          <button class="btn primary" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.script-title-cell {
  font-weight: 600;
}

/* Recommendation badges */
.rec-badge {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.rec-high { background: var(--vermillion); color: #fff; }
.rec-mid  { background: var(--ink); color: var(--paper); }
.rec-low  { background: var(--ink-soft); color: var(--paper); }
.rec-none { color: var(--ink-soft); }

/* Progress bar */
.progress-wrap {
  margin-bottom: 12px;
}
.progress-bar {
  height: 3px; background: var(--rule-soft); border-radius: 2px;
  overflow: hidden; position: relative;
}
.progress-bar::after {
  content: ''; position: absolute; top: 0; left: 0;
  height: 100%; width: 30%; background: var(--vermillion); border-radius: 2px;
  animation: progress-slide 1.2s ease-in-out infinite;
}
@keyframes progress-slide {
  0% { left: -30%; } 100% { left: 100%; }
}
.progress-text {
  display: block; font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-soft); letter-spacing: 0.05em; margin-top: 6px;
}

/* Generate result */
.generate-result {
  background: var(--paper-dark); border: 1px solid var(--rule-soft);
  padding: 20px 24px;
}
.generate-title {
  font-family: var(--font-serif); font-size: 14px; font-weight: 700;
  margin-bottom: 8px; color: var(--ink);
}
.generate-content {
  font-family: var(--font-sans); font-size: 14px; line-height: 1.85;
  color: var(--ink-mid); white-space: pre-wrap;
  max-height: 400px; overflow-y: auto;
}

.modal-close {
  font-family: var(--font-serif); font-size: 28px; line-height: 1;
  color: var(--ink-soft); cursor: pointer;
  padding: 0 4px; transition: color var(--duration-fast);
}
.modal-close:hover { color: var(--vermillion); }

/* Custom product picker */
.picker-trigger {
  display: flex; align-items: center;
  padding: 10px 32px 10px 12px;
  border: 1px solid var(--rule);
  font-family: var(--font-sans); font-size: 14px;
  background: var(--paper); cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236A6A64' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  transition: border-color var(--duration-fast);
}
.picker-trigger:hover { border-color: var(--ink); }
.picker-text { color: var(--ink); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker-placeholder { color: var(--ink-soft); flex: 1; }

.picker-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 100;
  background: var(--paper); border: 1px solid var(--rule);
  max-height: 152px; overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.picker-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; cursor: pointer;
  font-size: 13px; border-bottom: 1px solid var(--rule-soft);
  transition: background var(--duration-fast);
}
.picker-item:last-child { border-bottom: none; }
.picker-item:hover { background: var(--paper-dark); }
.picker-item.active { background: var(--vermillion-soft); }
.picker-name { color: var(--ink); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picker-meta { color: var(--ink-soft); font-family: var(--font-mono); font-size: 11px; flex-shrink: 0; }
.picker-empty { padding: 20px; text-align: center; color: var(--ink-soft); font-size: 14px; }
</style>
