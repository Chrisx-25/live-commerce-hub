<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { selectionAPI } from '../api'
import PageHeader from '../components/PageHeader.vue'
import DataTable from '../components/DataTable.vue'

const rankings = ref<any[]>([])
const recommendations = ref<any[]>([])
const advisorReport = ref<any>(null)
const loading = ref(false)
const categoryFilter = ref('')
const search = ref('')
let currentSort = ''
const selectedProductId = ref('')
const selectedProductName = ref('')
const advisorReportLoading = ref(false)
const coldStartLoading = ref(false)
const coldStartResult = ref<any>(null)
const coldStartError = ref('')

const categories = ['女装', '美妆', '箱包', '运动户外', '零食', '家居用品', '母婴', '数码', '食品饮料']

function doSearch() {
  load()
}

function handleSortChange(state: { key: string; direction: string } | null) {
  if (!state) return
  currentSort = state.key.startsWith('scores.') ? state.key.replace('scores.', '') : state.key
  load()
}

async function load() {
  loading.value = true
  try {
    const { data } = await selectionAPI.rankings({ category: categoryFilter.value, sort: currentSort, search: search.value })
    rankings.value = data
  } finally { loading.value = false }
}

async function loadRecommendations(productId: string) {
  selectedProductId.value = productId
  selectedProductName.value = rankings.value.find((p) => p.product_id === productId)?.product_name || ''
  coldStartResult.value = null
  coldStartError.value = ''
  const { data } = await selectionAPI.recommendations(productId)
  recommendations.value = data
}

async function selectProduct(row: any) {
  await loadRecommendations(row.product_id)
}

async function runColdStart() {
  if (!selectedProductId.value || !selectedProduct.value?.isColdStartCandidate) return
  coldStartLoading.value = true
  coldStartError.value = ''
  try {
    const { data } = await selectionAPI.coldstart(selectedProductId.value)
    coldStartResult.value = data
  } catch (err: any) {
    coldStartError.value = err?.response?.data?.message || err?.message || '新品冷启动评估失败'
  } finally {
    coldStartLoading.value = false
  }
}

async function loadReport() {
  if (advisorReport.value) {
    advisorReport.value = null
    return
  }
  advisorReportLoading.value = true
  try {
    const { data } = await selectionAPI.advisorReport()
    advisorReport.value = data
  } finally {
    advisorReportLoading.value = false
  }
}

const selectedProduct = computed(() => rankings.value.find((p) => p.product_id === selectedProductId.value))

function formatAssessment(value: any) {
  if (!value) return []
  if (typeof value === 'string') return [{ label: '评估结论', value }]
  const labels: Record<string, string> = {
    potential_level: '潜力等级',
    estimated_conversion: '预估转化',
    target_audience: '目标人群',
    selling_angle: '讲解角度',
    risk_notes: '风险提示',
  }
  return Object.entries(value).map(([key, val]) => ({ label: labels[key] || key, value: String(val) }))
}

function scoreComponentRows(result: any) {
  const labels: Record<string, string> = {
    similarProducts: '相似商品',
    categoryTrend: '品类趋势',
    supplierReadiness: '供应履约',
    inventoryReadiness: '库存保障',
    grossMargin: '毛利空间',
    trialSignal: '试播信号',
  }
  return Object.entries(result?.scoreComponents || {}).map(([key, value]) => ({
    key,
    label: labels[key] || key,
    value: Number(value) || 0,
  }))
}

function decisionClass(action?: string) {
  if (action === '加码试播') return 'decision-strong'
  if (action === '建议试播') return 'decision-ready'
  if (action === '继续观察') return 'decision-watch'
  return 'decision-hold'
}

onMounted(() => { load() })

const rankColumns = [
  { key: 'product_name', label: '商品名称' },
  { key: 'product_status', label: '状态' },
  { key: 'category', label: '品类' },
  { key: 'sale_price', label: '售价' },
  { key: 'scores.conversion', label: '转化力' },
  { key: 'scores.profitability', label: '盈利力' },
  { key: 'scores.heat', label: '热度' },
  { key: 'scores.trend', label: '趋势' },
  { key: 'scores.quality', label: '售后' },
  { key: 'scores.composite', label: '综合' },
  { key: 'trendLabel', label: '走势' },
]

const recColumns = [
  { key: 'product_name', label: '商品名称' },
  { key: 'category', label: '品类' },
  { key: 'sale_price', label: '售价' },
  { key: 'co_count', label: '共同购买' },
  { key: 'jaccard', label: '关联度' },
]
</script>

<template>
  <PageHeader title="选品分析" subtitle="智能推荐引擎 / 数字顾问 / 品类关联" />
  <div class="page-body">
    <div class="toolbar">
      <input v-model="search" class="input" placeholder="搜索商品名称..." @keyup.enter="doSearch()" style="width:200px;" />
      <button class="btn" @click="doSearch()">搜索</button>
      <select v-model="categoryFilter" class="form-select" style="width:auto;" @change="load()">
        <option value="">全部分类</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <button class="btn" @click="load()">刷新</button>
      <button class="btn" :disabled="advisorReportLoading" @click="loadReport()">
        {{ advisorReportLoading ? '生成中...' : advisorReport ? '隐藏顾问报告' : '生成顾问报告' }}
      </button>
      <button class="btn btn-primary" :disabled="!selectedProduct?.isColdStartCandidate || coldStartLoading" @click="runColdStart">
        {{ coldStartLoading ? '评估中...' : '新品冷启动评估' }}
      </button>
      <span v-if="selectedProductName" style="color:var(--ink-soft);font-size:13px;">
        已选：{{ selectedProductName }}
        <span v-if="!selectedProduct?.isColdStartCandidate"> · 冷启动仅用于待评估新品</span>
      </span>
    </div>

    <!-- Advisor Report -->
    <div v-if="advisorReport" class="card" style="margin-bottom:24px;">
      <div class="card-header">
        <span class="card-title">数字顾问报告</span>
        <span class="report-meta">{{ advisorReport.dataBasis }}</span>
      </div>
      <div class="card-divider"></div>
      <div class="card-body">
        <div class="report-grid">
          <div class="report-panel report-wide">
            <div class="section-title">管理摘要</div>
            <p v-for="item in advisorReport.executiveSummary" :key="item">{{ item }}</p>
          </div>
          <div class="report-panel">
            <div class="section-title">行动项</div>
            <ol class="action-list">
              <li v-for="item in advisorReport.actionItems" :key="item">{{ item }}</li>
            </ol>
          </div>
          <div class="report-panel">
            <div class="section-title">加码商品</div>
            <div v-for="p in advisorReport.topProducts" :key="p.product_name" class="report-item">
              <span>{{ p.product_name }}</span>
              <strong>{{ p.score }}分</strong>
              <small>{{ p.reason }}</small>
            </div>
          </div>
          <div class="report-panel">
            <div class="section-title">新品观察</div>
            <div v-for="p in advisorReport.coldStartCandidates" :key="p.product_name" class="report-item">
              <span>{{ p.product_name }}</span>
              <strong>{{ p.score }}分</strong>
              <small>{{ p.reason }}</small>
            </div>
          </div>
          <div class="report-panel">
            <div class="section-title">品类机会</div>
            <div v-for="c in advisorReport.categoryOpportunities" :key="c.category" class="report-item">
              <span>{{ c.category }} · {{ c.productCount }}品</span>
              <strong>{{ c.avgScore }}分</strong>
              <small>{{ c.suggestion }}</small>
            </div>
          </div>
          <div class="report-panel">
            <div class="section-title">风险提醒</div>
            <div v-for="p in advisorReport.riskProducts" :key="p.product_name" class="report-item">
              <span>{{ p.product_name }}</span>
              <strong>{{ p.score }}分</strong>
              <small>{{ p.reason }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Cold Start -->
    <div v-if="coldStartLoading || coldStartResult || coldStartError" class="card cold-feedback-card" style="margin-bottom:24px;">
      <div class="card-header">
        <span class="card-title">新品冷启动评估</span>
        <span v-if="selectedProductName" class="report-meta">当前新品：{{ selectedProductName }}</span>
      </div>
      <div class="card-divider"></div>
      <div class="card-body">
        <div v-if="coldStartLoading" class="cold-loading">
          <strong>正在评估新品潜力</strong>
          <span>系统正在读取相似商品、品类趋势、供应履约、库存和试播信号。</span>
        </div>
        <div v-else-if="coldStartError" style="color:var(--vermillion);font-size:13px;">{{ coldStartError }}</div>
        <div v-else>
          <div class="cold-summary">
            <div class="cold-metric decision-card">
              <span>建议动作</span>
              <strong :class="decisionClass(coldStartResult.decision?.action)">{{ coldStartResult.decision?.action }}</strong>
              <small>{{ coldStartResult.decision?.reason }}</small>
            </div>
            <div class="cold-metric">
              <span>预估分</span>
              <strong>{{ coldStartResult.estimatedScore }}</strong>
            </div>
            <div class="cold-metric">
              <span>置信度</span>
              <strong>{{ coldStartResult.confidence }}</strong>
            </div>
            <div class="cold-metric">
              <span>探索加权</span>
              <strong>+{{ coldStartResult.explorationBoost }}</strong>
            </div>
          </div>

          <div class="cold-section">
            <div class="section-title">评分构成</div>
            <div class="score-bars">
              <div v-for="item in scoreComponentRows(coldStartResult)" :key="item.key" class="score-row">
                <span>{{ item.label }}</span>
                <div class="score-track"><i :style="{ width: `${Math.min(item.value, 100)}%` }"></i></div>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>

          <div class="cold-grid cold-section">
            <div class="assessment-panel">
              <div class="section-title">AI/规则初评</div>
              <div v-for="item in formatAssessment(coldStartResult.llmAssessment)" :key="item.label" class="assessment-row">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
            <div class="assessment-panel">
              <div class="section-title">试播策略</div>
              <div class="assessment-row"><span>试播阶段</span><strong>{{ coldStartResult.trialStrategy?.targetSessions }}</strong></div>
              <div class="assessment-row"><span>流量策略</span><strong>{{ coldStartResult.trialStrategy?.trafficPolicy }}</strong></div>
              <div class="assessment-row"><span>复盘指标</span><strong>{{ coldStartResult.trialStrategy?.reviewMetrics?.join(' / ') }}</strong></div>
            </div>
            <div class="assessment-panel">
              <div class="section-title">执行建议</div>
              <div class="assessment-row"><span>主播</span><strong>{{ coldStartResult.executionSuggestions?.anchor }}</strong></div>
              <div class="assessment-row"><span>时段</span><strong>{{ coldStartResult.executionSuggestions?.timeSlot }}</strong></div>
              <div class="assessment-row"><span>话术</span><strong>{{ coldStartResult.executionSuggestions?.scriptAngle }}</strong></div>
            </div>
          </div>

          <div class="cold-section baseline-grid">
            <div><span>品类转化基线</span><strong>{{ coldStartResult.baselines?.categoryAvgConversion }}%</strong></div>
            <div><span>品类点击基线</span><strong>{{ coldStartResult.baselines?.categoryAvgClick }}%</strong></div>
            <div><span>品类热度基线</span><strong>{{ coldStartResult.baselines?.categoryAvgHeat }}</strong></div>
            <div><span>可播库存</span><strong>{{ coldStartResult.baselines?.inventoryTotal }}</strong></div>
          </div>
        </div>
        <div v-if="!coldStartLoading && coldStartResult?.similarProducts?.length" style="margin-top:16px;">
          <div style="font-weight:600;margin-bottom:8px;">相似商品参照</div>
          <div class="similar-list">
            <div v-for="p in coldStartResult.similarProducts" :key="p.product_id" class="similar-item">
              <span>{{ p.product_name }}</span>
              <strong>{{ (p.similarity * 100).toFixed(1) }}%</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rankings -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header"><span class="card-title">智能选品排名 (五维评分)</span></div>
      <div class="card-divider"></div>
      <div class="card-body">
        <DataTable :columns="rankColumns" :data="rankings" :loading="loading" @row-click="selectProduct" @sort-change="handleSortChange">
          <template #cell-product_name="{ row }">
            <span style="font-weight:600;">{{ row.product_name }}</span>
          </template>
          <template #cell-product_status="{ row }">
            <span :class="row.isColdStartCandidate ? 'status-chip status-new' : 'status-chip'">
              {{ row.isColdStartCandidate ? '新品' : row.product_status }}
            </span>
          </template>
          <template #cell-sale_price="{ value }">¥{{ value }}</template>
          <template #[`cell-scores.composite`]="{ row }">
            <span style="font-weight:700;font-family:var(--font-mono);">{{ row.scores?.composite }}</span>
          </template>
          <template #cell-trendLabel="{ value }">
            <span :style="{ color: value?.includes('上升') ? 'var(--success)' : value?.includes('下降') ? 'var(--vermillion)' : 'var(--ink-soft)' }">
              {{ value }}
            </span>
          </template>
        </DataTable>
      </div>
    </div>

    <!-- Association Recommendations -->
    <div v-if="recommendations.length" class="card">
      <div class="card-header"><span class="card-title">关联推荐 (买了该商品的人也买了...)</span></div>
      <div class="card-divider"></div>
      <div class="card-body">
        <DataTable :columns="recColumns" :data="recommendations">
          <template #cell-sale_price="{ value }">¥{{ value }}</template>
          <template #cell-jaccard="{ value }">{{ (value * 100).toFixed(1) }}%</template>
        </DataTable>
      </div>
    </div>
    <div v-else style="margin-top:16px;color:var(--ink-soft);font-size:13px;">
      点击排名表中的商品可查看关联推荐。
    </div>
  </div>
</template>

<style scoped>
.report-meta {
  margin-left: auto;
  color: var(--ink-soft);
  font-size: 12px;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(280px, 1fr));
  gap: 14px;
}

.report-panel {
  border: 1px solid var(--rule-soft);
  border-radius: 8px;
  padding: 14px;
  min-height: 120px;
}

.report-wide {
  grid-column: 1 / -1;
}

.report-panel p {
  margin: 0 0 8px;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.7;
}

.action-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
}

.report-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--rule-soft);
  font-size: 13px;
}

.report-item:last-child {
  border-bottom: 0;
}

.report-item span {
  font-weight: 600;
}

.report-item strong {
  font-family: var(--font-mono);
  color: var(--vermillion);
}

.report-item small {
  grid-column: 1 / -1;
  color: var(--ink-soft);
  line-height: 1.5;
}

.new-product-mark {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 6px;
  border: 1px solid var(--vermillion);
  color: var(--vermillion);
  font-size: 11px;
  font-weight: 700;
}

.status-chip {
  display: inline-block;
  min-width: 56px;
  padding: 2px 8px;
  border: 1px solid var(--rule);
  color: var(--ink-soft);
  font-size: 12px;
  text-align: center;
}

.status-new {
  border-color: var(--vermillion);
  background: var(--vermillion-soft);
  color: var(--vermillion);
  font-weight: 700;
}

.cold-feedback-card {
  border-color: var(--vermillion);
}

.cold-loading {
  border: 1px solid var(--rule-soft);
  border-left: 4px solid var(--vermillion);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cold-loading strong {
  font-size: 15px;
}

.cold-loading span {
  color: var(--ink-soft);
  font-size: 13px;
}

.cold-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 12px;
}

.cold-summary {
  display: grid;
  grid-template-columns: minmax(280px, 1.5fr) repeat(3, minmax(120px, 1fr));
  gap: 12px;
}

.cold-metric {
  border: 1px solid var(--rule-soft);
  border-radius: 8px;
  padding: 12px;
  min-height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.decision-card {
  min-height: 104px;
}

.cold-metric span,
.assessment-row span {
  color: var(--ink-soft);
  font-size: 12px;
}

.cold-metric strong {
  font-family: var(--font-mono);
  font-size: 22px;
}

.cold-metric small {
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.6;
}

.decision-strong {
  color: var(--success);
}

.decision-ready {
  color: var(--vermillion);
}

.decision-watch {
  color: var(--gold);
}

.decision-hold {
  color: var(--ink-soft);
}

.cold-section {
  margin-top: 16px;
}

.section-title {
  font-weight: 700;
  margin-bottom: 10px;
}

.score-bars {
  display: grid;
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 10px 24px;
  border: 1px solid var(--rule-soft);
  border-radius: 8px;
  padding: 14px;
}

.score-row {
  display: grid;
  grid-template-columns: 72px 1fr 36px;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.score-row span {
  color: var(--ink-soft);
}

.score-row strong {
  font-family: var(--font-mono);
}

.score-track {
  height: 8px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.score-track i {
  display: block;
  height: 100%;
  background: var(--vermillion);
}

.assessment-panel {
  border: 1px solid var(--rule-soft);
  border-radius: 8px;
  padding: 12px;
}

.assessment-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}

.baseline-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 10px;
}

.baseline-grid div {
  border: 1px solid var(--rule-soft);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.baseline-grid span {
  color: var(--ink-soft);
}

.baseline-grid strong {
  font-family: var(--font-mono);
}

.similar-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.similar-item {
  border: 1px solid var(--rule-soft);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

@media (max-width: 720px) {
  .report-grid,
  .cold-summary,
  .cold-grid {
    grid-template-columns: 1fr;
  }

  .report-wide {
    grid-column: auto;
  }

  .score-bars,
  .baseline-grid {
    grid-template-columns: 1fr;
  }

  .assessment-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
