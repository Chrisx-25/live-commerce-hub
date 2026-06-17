<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { reportsAPI } from '../api'
import type { OperationReport } from '../types'
import PageHeader from '../components/PageHeader.vue'
import DataTable from '../components/DataTable.vue'

const reports = ref<(OperationReport & Record<string, any>)[]>([])
const typeFilter = ref('')
const viewing = ref<(OperationReport & Record<string, any>) | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await reportsAPI.list({ type: typeFilter.value })
    reports.value = data
    if (!viewing.value && data.length) viewing.value = data[0]
  } finally {
    loading.value = false
  }
}

async function viewReport(report: OperationReport) {
  const { data } = await reportsAPI.get(report.report_id)
  viewing.value = { ...report, ...data }
}

function formatDate(d: string) { return d ? new Date(d).toLocaleString('zh-CN') : '-' }

const reportStats = computed(() => {
  const typeCounts = reports.value.reduce((acc: Record<string, number>, item) => {
    acc[item.report_type] = (acc[item.report_type] || 0) + 1
    return acc
  }, {})
  return [
    { label: '报告总数', value: reports.value.length, hint: '当前筛选范围' },
    { label: '周/月报', value: (typeCounts['周报'] || 0) + (typeCounts['月报'] || 0), hint: '常规经营复盘' },
    { label: '专项分析', value: (typeCounts['专项分析'] || 0) + (typeCounts['选品专项'] || 0) + (typeCounts['售后专项'] || 0), hint: '选品、售后与风险' },
  ]
})

const reportParagraphs = computed(() => {
  const content = viewing.value?.report_content || ''
  return content.split(/\n+/).map((item) => item.trim()).filter(Boolean)
})

const insightCards = computed(() => {
  if (!viewing.value) return []
  const type = viewing.value.report_type
  const period = viewing.value.statistical_period || '当前统计周期'
  return [
    {
      label: '数据口径',
      value: period,
      hint: type.includes('售后') ? '订单、退款、投诉等级与处理状态' : 'GMV、订单、互动、库存与商品表现',
    },
    {
      label: '管理重点',
      value: type.includes('选品') ? '商品机会' : type.includes('售后') ? '履约体验' : '经营复盘',
      hint: type.includes('选品') ? '高分商品、新品冷启动和采购联动' : type.includes('售后') ? '处理时效、退款金额和投诉等级' : '核心 KPI 和异常波动',
    },
    {
      label: '建议动作',
      value: '形成闭环',
      hint: '将结论回流到排期、选品、库存或售后处理。',
    },
  ]
})

onMounted(() => load())

const columns = [
  { key: 'report_title', label: '报告标题', width: '33%' },
  { key: 'report_type', label: '类型', width: '11%' },
  { key: 'statistical_period', label: '统计周期', width: '17%' },
  { key: 'creator_name', label: '创建人', width: '10%' },
  { key: 'create_time', label: '创建时间', width: '14%' },
  { key: 'actions', label: '操作', sortable: false, width: '15%' },
]
</script>

<template>
  <PageHeader title="运营报告" subtitle="经营复盘、专项分析与管理建议" />
  <div class="page-body reports-page">
    <section class="report-summary">
      <div v-for="item in reportStats" :key="item.label" class="summary-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </div>
    </section>

    <div class="toolbar">
      <select v-model="typeFilter" class="form-select" style="width:auto;" @change="load()">
        <option value="">全部类型</option>
        <option value="周报">周报</option>
        <option value="月报">月报</option>
        <option value="季报">季报</option>
        <option value="专项分析">专项分析</option>
        <option value="选品专项">选品专项</option>
        <option value="售后专项">售后专项</option>
      </select>
      <button class="btn" @click="load()">刷新</button>
    </div>

    <div class="reports-layout">
      <div class="card report-list-card">
        <div class="card-header"><span class="card-title">报告列表</span></div>
        <div class="card-divider"></div>
        <div class="card-body">
          <DataTable :columns="columns" :data="reports" :loading="loading" @row-click="viewReport">
            <template #cell-create_time="{ value }">{{ formatDate(value) }}</template>
            <template #cell-report_title="{ row }">
              <button class="report-link" type="button" @click.stop="viewReport(row)">{{ row.report_title }}</button>
            </template>
            <template #cell-actions="{ row }">
              <button class="btn small" @click.stop="viewReport(row)">查看</button>
            </template>
          </DataTable>
        </div>
      </div>

      <aside class="card report-viewer" v-if="viewing">
        <div class="card-header viewer-head">
          <div>
            <span class="card-title">{{ viewing.report_title }}</span>
            <p>{{ viewing.report_type }} / {{ viewing.statistical_period }} / {{ viewing.creator_name || viewing.creator_id }}</p>
          </div>
          <button class="btn small" @click="viewing = null">关闭</button>
        </div>
        <div class="card-divider"></div>
        <div class="card-body">
          <div class="insight-grid">
            <div v-for="item in insightCards" :key="item.label" class="insight-card">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.hint }}</small>
            </div>
          </div>

          <div class="report-content">
            <div class="section-title">报告正文</div>
            <p v-for="paragraph in reportParagraphs" :key="paragraph">{{ paragraph }}</p>
            <p v-if="!reportParagraphs.length">暂无报告正文。</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.reports-page {
  display: grid;
  gap: 20px;
}

.report-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.summary-card,
.insight-card {
  border: 1px solid var(--rule-soft);
  background: var(--paper-dark);
  padding: 16px;
  display: grid;
  gap: 5px;
}

.summary-card span,
.summary-card small,
.insight-card span,
.insight-card small,
.viewer-head p {
  color: var(--ink-soft);
  font-size: 12px;
}

.summary-card strong {
  font-family: var(--font-serif);
  font-size: 30px;
  line-height: 1;
}

.reports-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
  gap: 20px;
  align-items: start;
}

.report-list-card,
.report-viewer {
  min-width: 0;
}

.report-link {
  border: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.viewer-head {
  align-items: flex-start;
}

.viewer-head p {
  margin-top: 4px;
}

.insight-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 18px;
}

.insight-card strong {
  font-size: 16px;
}

.report-content {
  border-top: 1px solid var(--rule-soft);
  padding-top: 16px;
}

.section-title {
  font-weight: 700;
  margin-bottom: 10px;
}

.report-content p {
  margin: 0 0 10px;
  color: var(--ink-mid);
  line-height: 1.85;
  user-select: text;
}

@media (max-width: 1100px) {
  .report-summary,
  .reports-layout {
    grid-template-columns: 1fr;
  }
}
</style>
