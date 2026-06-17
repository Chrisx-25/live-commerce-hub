<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { anchorsAPI, anchorProductPlanningAPI, liveSessionsAPI, productsAPI, scriptsAPI } from '../api'

const route = useRoute()
const router = useRouter()
const products = ref<any[]>([])
const anchors = ref<any[]>([])
const sessions = ref<any[]>([])
const fits = ref<any[]>([])
const plan = ref<any | null>(null)
const selectedProductId = ref('')
const selectedAnchorId = ref('')
const selectedLiveId = ref('')
const loading = ref(false)
const confirming = ref(false)
const savingPlan = ref(false)
const startingLive = ref(false)
const error = ref('')
const message = ref('')
const planDraft = ref<any | null>(null)
const showScriptModal = ref(false)
const scriptLoading = ref(false)
const editingScript = ref<any | null>(null)
const showCreateSessionModal = ref(false)
const createSessionSaving = ref(false)
const createSessionForm = ref({
  anchor_id: '',
  live_title: '',
  platform: '抖音',
  live_category: '女装',
  start_time: '',
  live_status: '待安排',
})

const UNPLANNABLE = new Set(['进行中', '已结束'])
const plannableSessions = computed(() => sessions.value.filter((item) => {
  const status = String(item.live_status || '').trim()
  return !UNPLANNABLE.has(status)
}))
const selectedSession = computed(() => sessions.value.find((item) => item.live_id === selectedLiveId.value))
const selectedAnchor = computed(() => anchors.value.find((item) => item.anchor_id === (plan.value?.anchor_id || selectedSession.value?.anchor_id || selectedAnchorId.value)))
const bestFit = computed(() => fits.value[0])
const roleCounts = computed(() => {
  const source = plan.value?.items?.length ? plan.value.items.map((item: any) => ({ recommended_role: item.plan_role })) : fits.value
  return source.reduce((acc: Record<string, number>, item: any) => {
    acc[item.recommended_role] = (acc[item.recommended_role] || 0) + 1
    return acc
  }, {})
})
const planReady = computed(() => plan.value && plan.value.items?.length)
const canConfirmPlan = computed(() => planReady.value && plan.value.plan_status !== '已确认')
const LOCKED_STATUSES = new Set(['进行中', '已结束'])
const canEditPlan = computed(() => planReady.value && !LOCKED_STATUSES.has(String(plan.value?.live_status || '').trim()))
const isScheduledPlan = computed(() => plan.value?.live_status === '已排期')
const categories = ['女装', '美妆', '箱包', '运动户外', '零食', '家居用品', '母婴', '数码', '食品饮料']

function formatMoney(value: number) {
  return `¥${Number(value || 0).toLocaleString()}`
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function levelClass(level: string) {
  return `level-${String(level || 'C').toLowerCase()}`
}

function roleClass(role: string) {
  if (role === '主推') return 'role-main'
  if (role === '辅推') return 'role-support'
  if (role === '试播') return 'role-test'
  return 'role-hold'
}

function statusClass(status: string) {
  if (status === '已确认') return 'status-confirmed'
  if (status === '草案') return 'status-draft'
  return 'status-default'
}

function toDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function openCreateSession() {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000)
  createSessionForm.value = {
    anchor_id: selectedAnchorId.value || anchors.value[0]?.anchor_id || '',
    live_title: '',
    platform: selectedSession.value?.platform || '抖音',
    live_category: selectedSession.value?.live_category || selectedAnchor.value?.specialization || '女装',
    start_time: toDateTimeInput(nextHour),
    live_status: '待安排',
  }
  showCreateSessionModal.value = true
}

async function createSession() {
  createSessionSaving.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = {
      ...createSessionForm.value,
      live_title: createSessionForm.value.live_title || `${createSessionForm.value.live_category}待安排直播场次`,
    }
    const { data } = await liveSessionsAPI.create(payload)
    const liveRes = await liveSessionsAPI.list({ pageSize: 200, sortBy: 'start_time', sortDir: 'desc' })
    sessions.value = liveRes.data.data || liveRes.data
    selectedLiveId.value = data.live_id
    selectedAnchorId.value = data.anchor_id || selectedAnchorId.value
    showCreateSessionModal.value = false
    message.value = '未开播场次已创建，可继续生成带货计划。'
  } catch (e: any) {
    error.value = e.response?.data?.message || '新增场次失败'
  } finally {
    createSessionSaving.value = false
  }
}

function clonePlanForEdit(source: any) {
  if (!source) return null
  return {
    plan_goal: source.plan_goal || '',
    items: (source.items || []).map((item: any) => ({
      item_id: item.item_id,
      product_name: item.product_name,
      category: item.category,
      sort_order: item.sort_order,
      plan_role: item.plan_role,
      suggested_minutes: item.suggested_minutes,
      target_gmv: item.target_gmv,
      target_orders: item.target_orders,
      script_id: item.script_id,
      script_title: item.script_title,
      plan_reason: item.plan_reason,
      risk_notes: item.risk_notes,
    })),
  }
}

async function loadBaseData() {
  const [productRes, anchorRes, liveRes] = await Promise.all([
    productsAPI.list({ pageSize: 100 }),
    anchorsAPI.list({ pageSize: 80 }),
    liveSessionsAPI.list({ pageSize: 200, sortBy: 'start_time', sortDir: 'desc' }),
  ])
  products.value = productRes.data.data || productRes.data
  anchors.value = anchorRes.data.data || anchorRes.data
  sessions.value = liveRes.data.data || liveRes.data
  selectedProductId.value = products.value[0]?.product_id || ''
  selectedAnchorId.value = anchors.value[0]?.anchor_id || ''
  const requestedLiveId = String(route.query.liveId || '')
  let requestedSession = plannableSessions.value.find((item) => item.live_id === requestedLiveId)
  // If the requested session wasn't in the first page (e.g., old session pushed to page 2),
  // fetch it individually so the dropdown always includes the URL-targeted session.
  if (requestedLiveId && !requestedSession) {
    try {
      const { data } = await liveSessionsAPI.get(requestedLiveId)
      if (data && data.live_id) {
        sessions.value.unshift(data)
        if (!UNPLANNABLE.has(String(data.live_status || '').trim())) {
          requestedSession = data
        }
      }
    } catch (_) { /* ignore — session may have been deleted */ }
  }
  const firstPendingSession = plannableSessions.value.find((item) => item.live_status === '待安排')
  selectedLiveId.value = requestedSession?.live_id || firstPendingSession?.live_id || plannableSessions.value[0]?.live_id || sessions.value[0]?.live_id || ''
}

async function loadPlanForSelectedSession() {
  plan.value = null
  planDraft.value = null
  if (!selectedLiveId.value) return
  try {
    const { data } = await anchorProductPlanningAPI.getPlan(selectedLiveId.value)
    plan.value = data
    planDraft.value = clonePlanForEdit(data)
    if (data?.anchor_id) selectedAnchorId.value = data.anchor_id
  } catch (e: any) {
    if (e.response?.status === 404 && selectedSession.value?.live_status === '已排期') {
      try {
        const { data: draft } = await anchorProductPlanningAPI.createPlan(selectedLiveId.value)
        const { data: confirmed } = await anchorProductPlanningAPI.confirmPlan(draft.plan_id)
        plan.value = confirmed
        planDraft.value = clonePlanForEdit(confirmed)
        if (confirmed?.anchor_id) selectedAnchorId.value = confirmed.anchor_id
        message.value = '已自动补齐本场已排期直播的带货安排详情。'
      } catch (autoErr: any) {
        error.value = autoErr.response?.data?.message || '自动补齐已排期计划失败，请手动生成'
      }
      return
    }
    if (e.response?.status !== 404) error.value = e.response?.data?.message || '计划加载失败'
  }
}

async function loadFits() {
  try {
    const { data } = await anchorProductPlanningAPI.fits({
      productId: selectedProductId.value || undefined,
      anchorId: selectedAnchorId.value || undefined,
      limit: 30,
    })
    fits.value = Array.isArray(data) ? data : (data?.fits || data?.data || [])
  } catch (_e: any) {
    // Fits are reference information only; a failed load should not
    // surface as a page-level error. The panel shows its own empty state.
    fits.value = []
  }
}

async function runProductFit() {
  if (!selectedProductId.value) return
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    const { data } = await anchorProductPlanningAPI.generateForProduct(selectedProductId.value)
    fits.value = data
    message.value = '商品适配已刷新，可作为场次排品参考。'
  } catch (e: any) {
    error.value = e.response?.data?.message || '商品适配生成失败'
  } finally {
    loading.value = false
  }
}

async function runAnchorFit() {
  if (!selectedAnchorId.value) return
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    const { data } = await anchorProductPlanningAPI.generateForAnchor(selectedAnchorId.value)
    fits.value = data
    message.value = '主播适配已刷新，可用于检查备选商品。'
  } catch (e: any) {
    error.value = e.response?.data?.message || '主播适配生成失败'
  } finally {
    loading.value = false
  }
}

async function runLivePlan() {
  if (!selectedLiveId.value) return
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    const { data } = await anchorProductPlanningAPI.createPlan(selectedLiveId.value)
    plan.value = data
    planDraft.value = clonePlanForEdit(data)
    if (data?.anchor_id) selectedAnchorId.value = data.anchor_id
    message.value = '场次排品草案已生成，请审查商品顺序、推荐时长、目标和风险后确认。'
    await loadFits()
  } catch (e: any) {
    error.value = e.response?.data?.message || '场次计划生成失败'
  } finally {
    loading.value = false
  }
}

async function confirmPlan() {
  if (!plan.value?.plan_id) return
  confirming.value = true
  error.value = ''
  message.value = ''
  try {
    const { data } = await anchorProductPlanningAPI.confirmPlan(plan.value.plan_id)
    plan.value = data
    planDraft.value = clonePlanForEdit(data)
    const liveRes = await liveSessionsAPI.list({ pageSize: 200, sortBy: 'start_time', sortDir: 'desc' })
    sessions.value = liveRes.data.data || liveRes.data
    message.value = '计划已确认，直播场次已更新为已排期。'
  } catch (e: any) {
    error.value = e.response?.data?.message || '确认计划失败'
  } finally {
    confirming.value = false
  }
}

async function savePlanAdjustments() {
  if (!plan.value?.plan_id || !planDraft.value) return
  savingPlan.value = true
  error.value = ''
  message.value = ''
  try {
    const { data } = await anchorProductPlanningAPI.updatePlan(plan.value.plan_id, {
      plan_goal: planDraft.value.plan_goal,
      items: planDraft.value.items,
    })
    plan.value = data
    planDraft.value = clonePlanForEdit(data)
    message.value = '人工调整已保存，系统已重新计算目标 GMV、订单和讲解时长。'
  } catch (e: any) {
    error.value = e.response?.data?.message || '保存计划调整失败'
  } finally {
    savingPlan.value = false
  }
}

async function openScript(item: any) {
  if (!item.script_id) return
  showScriptModal.value = true
  scriptLoading.value = true
  editingScript.value = null
  try {
    const { data } = await scriptsAPI.get(item.script_id)
    editingScript.value = data
  } catch (e: any) {
    error.value = e.response?.data?.message || '脚本加载失败'
    showScriptModal.value = false
  } finally {
    scriptLoading.value = false
  }
}

async function saveScript() {
  if (!editingScript.value?.script_id) return
  scriptLoading.value = true
  try {
    const { data } = await scriptsAPI.update(editingScript.value.script_id, {
      script_title: editingScript.value.script_title,
      script_content: editingScript.value.script_content,
      tags: editingScript.value.tags,
    })
    editingScript.value = data
    message.value = '讲解脚本已更新。'
    showScriptModal.value = false
    await loadPlanForSelectedSession()
  } catch (e: any) {
    error.value = e.response?.data?.message || '脚本保存失败'
  } finally {
    scriptLoading.value = false
  }
}

async function startLive() {
  if (!plan.value?.live_id) return
  startingLive.value = true
  error.value = ''
  try {
    await liveSessionsAPI.startSimulate(plan.value.live_id, { preloadSeconds: 0 })
    router.push(`/monitor?id=${plan.value.live_id}`)
  } catch (e: any) {
    error.value = e.response?.data?.message || '开启直播失败'
  } finally {
    startingLive.value = false
  }
}

watch(selectedLiveId, async () => {
  error.value = ''
  message.value = ''
  await loadPlanForSelectedSession()
})

onMounted(async () => {
  loading.value = true
  try {
    await loadBaseData()
    await Promise.all([loadPlanForSelectedSession(), loadFits()])
  } catch (e: any) {
    error.value = e.response?.data?.message || '页面数据加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <PageHeader title="场次安排" subtitle="未开播场次排品 / 主播商品适配 / 计划确认入排期" />

  <div class="page-body planning-page">
    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="message" class="message-banner">{{ message }}</div>

    <!-- Session context bar: single-row, select existing or create new -->
    <section class="session-context">
      <label class="context-label">未开播场次</label>
      <select v-model="selectedLiveId" class="form-select context-select">
        <option v-for="session in plannableSessions" :key="session.live_id" :value="session.live_id">
          {{ session.live_title }} / {{ session.live_status }} / {{ formatDate(session.start_time) }}
        </option>
      </select>
      <button class="btn context-add-btn" @click="openCreateSession">+ 新增场次</button>
      <span class="context-divider"></span>
      <span class="meta-item">{{ selectedSession?.anchor_name || selectedAnchor?.anchor_name || '—' }}</span>
      <span class="meta-sep">·</span>
      <span class="meta-item">{{ selectedSession?.live_category || '—' }}</span>
      <span class="meta-sep">·</span>
      <span class="meta-item">{{ selectedSession?.platform || '—' }}</span>
      <span class="meta-sep">·</span>
      <span class="meta-item">{{ formatDate(selectedSession?.start_time) }}</span>
      <span v-if="plan" class="plan-status" :class="statusClass(plan.plan_status)">{{ plan.plan_status }}</span>
    </section>

    <!-- Workflow actions: operate on the selected session -->
    <section class="action-bar">
      <button :class="isScheduledPlan ? 'btn' : 'btn primary'" :disabled="loading || !selectedLiveId" @click="runLivePlan">
        生成带货计划
      </button>
      <button class="btn" :disabled="confirming || !canConfirmPlan" @click="confirmPlan">
        确认排期
      </button>
      <button class="btn" :disabled="savingPlan || !canEditPlan" @click="savePlanAdjustments">
        {{ savingPlan ? '保存中...' : '保存调整' }}
      </button>
      <button v-if="isScheduledPlan" class="btn primary" :disabled="startingLive" @click="startLive">
        {{ startingLive ? '开启中...' : '开始直播' }}
      </button>
    </section>

    <section class="summary-grid">
      <div class="summary-tile">
        <span>计划场次</span>
        <strong>{{ (selectedSession?.live_title || '-').split('#')[0] }}</strong>
        <small>{{ (selectedSession?.live_title || '').includes('#') ? '#' + (selectedSession?.live_title || '').split('#')[1] : '#' + (selectedSession?.live_id || '-') }}</small>
      </div>
      <div class="summary-tile">
        <span>主播与品类</span>
        <strong>{{ selectedAnchor?.anchor_name || selectedSession?.anchor_name || '-' }}</strong>
        <small>{{ selectedSession?.live_category || selectedAnchor?.specialization || '-' }}</small>
      </div>
      <div class="summary-tile accent">
        <span>计划目标 GMV</span>
        <strong>{{ plan ? formatMoney(plan.target_gmv) : '-' }}</strong>
        <small>{{ plan ? `${plan.target_orders} 单 / ${plan.total_planned_minutes} 分钟` : '等待生成' }}</small>
      </div>
      <div class="summary-tile">
        <span>商品角色结构</span>
        <strong>{{ roleCounts['主推'] || 0 }} / {{ roleCounts['辅推'] || 0 }} / {{ roleCounts['试播'] || 0 }}</strong>
        <small>主推 / 辅推 / 试播</small>
      </div>
    </section>

    <section class="content-grid">
      <div class="panel plan-panel">
        <div class="panel-head">
          <div>
            <h3>场次带货计划</h3>
            <p>系统生成的是可审查草案，确认后用于直播执行；具体话术仍由脚本模块承接。</p>
          </div>
        </div>

        <div v-if="!plan" class="plan-placeholder">
          选择未开播场次后点击“一键生成场次带货计划”，系统会自动选择适配商品并给出推荐时间、目标和风险。
        </div>

        <template v-else>
          <div class="plan-hero">
            <span>{{ plan.plan_status }} / {{ plan.live_status }}</span>
            <strong>{{ plan.live_title }}</strong>
            <small>{{ plan.anchor_name }} / {{ plan.live_category }} / {{ formatDate(plan.start_time) }}</small>
          </div>

          <div class="plan-metrics">
            <div>
              <span>目标 GMV</span>
              <strong>{{ formatMoney(plan.target_gmv) }}</strong>
            </div>
            <div>
              <span>目标订单</span>
              <strong>{{ plan.target_orders }}</strong>
            </div>
            <div>
              <span>规划时长</span>
              <strong>{{ plan.total_planned_minutes }} 分钟</strong>
            </div>
          </div>

          <div v-if="planDraft" class="plan-editor">
            <label class="form-label">场次目标说明</label>
            <textarea v-model="planDraft.plan_goal" class="form-input" rows="3" :disabled="!canEditPlan" />

            <div class="plan-items editable">
              <div v-for="item in planDraft.items" :key="item.item_id" class="plan-item editable-item">
                <div class="order">{{ item.sort_order }}</div>
                <div class="editable-body">
                  <div class="item-title-row">
                    <div>
                      <strong>{{ item.product_name }}</strong>
                      <small>{{ item.category }} / {{ item.script_title || '已生成场次脚本' }}</small>
                    </div>
                    <span class="role-pill" :class="roleClass(item.plan_role)">{{ item.plan_role }}</span>
                  </div>

                  <div class="edit-grid">
                    <label>
                      <span>顺序</span>
                      <input v-model.number="item.sort_order" type="number" min="1" class="form-input" :disabled="!canEditPlan" />
                    </label>
                    <label>
                      <span>角色</span>
                      <select v-model="item.plan_role" class="form-select" :disabled="!canEditPlan">
                        <option value="主推">主推</option>
                        <option value="辅推">辅推</option>
                        <option value="试播">试播</option>
                        <option value="暂缓">暂缓</option>
                      </select>
                    </label>
                    <label>
                      <span>讲解分钟</span>
                      <input v-model.number="item.suggested_minutes" type="number" min="1" class="form-input" :disabled="!canEditPlan" />
                    </label>
                    <label>
                      <span>目标 GMV</span>
                      <input v-model.number="item.target_gmv" type="number" min="0" class="form-input" :disabled="!canEditPlan" />
                    </label>
                    <label>
                      <span>目标订单</span>
                      <input v-model.number="item.target_orders" type="number" min="0" class="form-input" :disabled="!canEditPlan" />
                    </label>
                  </div>

                  <label class="wide-field">
                    <span>安排理由</span>
                    <textarea v-model="item.plan_reason" class="form-input" rows="2" :disabled="!canEditPlan" />
                  </label>
                  <label class="wide-field">
                    <span>风险备注</span>
                    <textarea v-model="item.risk_notes" class="form-input" rows="2" :disabled="!canEditPlan" />
                  </label>

                  <div class="script-actions">
                    <button class="btn small" :disabled="!item.script_id" @click="openScript(item)">
                      查看/编辑AI讲解脚本
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="panel fit-panel">
        <div class="panel-head compact">
          <div>
            <h3>适配依据</h3>
            <p>用于解释为什么系统选择这些商品和主播组合。</p>
          </div>
        </div>

        <div class="control-stack">
          <label class="form-label">按商品找主播</label>
          <select v-model="selectedProductId" class="form-select">
            <option v-for="product in products" :key="product.product_id" :value="product.product_id">
              {{ product.product_name }}
            </option>
          </select>
          <button class="btn small" :disabled="loading || !selectedProductId" @click="runProductFit">刷新商品适配</button>

          <label class="form-label">按主播找商品</label>
          <select v-model="selectedAnchorId" class="form-select">
            <option v-for="anchor in anchors" :key="anchor.anchor_id" :value="anchor.anchor_id">
              {{ anchor.anchor_name }} / {{ anchor.specialization }}
            </option>
          </select>
          <button class="btn small" :disabled="loading || !selectedAnchorId" @click="runAnchorFit">刷新主播适配</button>
        </div>

        <div class="best-fit">
          <span>当前最高适配</span>
          <strong>{{ bestFit ? `${bestFit.fit_score}分` : '-' }}</strong>
          <small>{{ bestFit ? `${bestFit.anchor_name} / ${bestFit.product_name}` : '暂无适配结果' }}</small>
        </div>

        <div class="fit-table">
          <div v-if="!fits.length" class="empty-state">暂无适配结果。</div>
          <div v-for="fit in fits.slice(0, 8)" :key="`${fit.anchor_id}-${fit.product_id}`" class="fit-row">
            <div>
              <strong>{{ fit.product_name }}</strong>
              <small>{{ fit.anchor_name }} / {{ fit.category }}</small>
            </div>
            <span class="score">{{ fit.fit_score }}</span>
            <span class="level-pill" :class="levelClass(fit.fit_level)">{{ fit.fit_level }}</span>
            <span class="role-pill" :class="roleClass(fit.recommended_role)">{{ fit.recommended_role }}</span>
            <p>{{ fit.match_reason }}</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="showCreateSessionModal" class="modal-overlay" @click.self="showCreateSessionModal = false">
      <div class="modal create-session-modal">
        <div class="modal-title">新增未开播场次</div>
        <div class="create-form-grid">
          <div class="form-group">
            <label class="form-label">主播</label>
            <select v-model="createSessionForm.anchor_id" class="form-select">
              <option v-for="anchor in anchors" :key="anchor.anchor_id" :value="anchor.anchor_id">
                {{ anchor.anchor_name }} / {{ anchor.specialization }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">平台</label>
            <select v-model="createSessionForm.platform" class="form-select">
              <option value="抖音">抖音</option>
              <option value="快手">快手</option>
              <option value="淘宝直播">淘宝直播</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">直播标题</label>
          <input v-model="createSessionForm.live_title" class="form-input" placeholder="例如：美妆新品冷启动试播专场" />
        </div>
        <div class="create-form-grid">
          <div class="form-group">
            <label class="form-label">品类</label>
            <select v-model="createSessionForm.live_category" class="form-select">
              <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">计划开始时间</label>
            <input v-model="createSessionForm.start_time" type="datetime-local" class="form-input" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn" @click="showCreateSessionModal = false">取消</button>
          <button class="btn primary" :disabled="createSessionSaving || !createSessionForm.anchor_id || !createSessionForm.start_time" @click="createSession">
            {{ createSessionSaving ? '创建中...' : '创建并安排' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showScriptModal" class="modal-overlay" @click.self="showScriptModal = false">
      <div class="modal script-modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">AI讲解脚本</div>
            <p>该脚本已绑定到当前场次、主播和商品，可在开播前人工润色。</p>
          </div>
          <button class="btn small" @click="showScriptModal = false">关闭</button>
        </div>
        <div v-if="scriptLoading" class="empty-state">脚本加载中...</div>
        <template v-else-if="editingScript">
          <label class="form-label">脚本标题</label>
          <input v-model="editingScript.script_title" class="form-input" />
          <label class="form-label">脚本内容</label>
          <textarea v-model="editingScript.script_content" class="form-input script-textarea" rows="18" />
          <label class="form-label">标签</label>
          <input v-model="editingScript.tags" class="form-input" />
          <div class="form-actions">
            <button class="btn" @click="showScriptModal = false">取消</button>
            <button class="btn primary" :disabled="scriptLoading" @click="saveScript">保存脚本</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.planning-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.error-banner {
  border: 1px solid rgba(196, 30, 58, 0.35);
  background: rgba(196, 30, 58, 0.08);
  color: var(--vermillion);
  padding: 12px 14px;
  font-weight: 600;
}

.message-banner {
  border: 1px solid rgba(20, 105, 78, 0.28);
  background: rgba(20, 105, 78, 0.08);
  color: var(--success);
  padding: 12px 14px;
  font-weight: 600;
}

/* ===== Session context bar — single row ===== */
.session-context {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px;
  border: 1px solid var(--rule);
  background: var(--paper-dark);
}
.context-label {
  font-family: var(--font-mono); font-size: 12px; font-weight: 600;
  color: var(--ink-soft); letter-spacing: 0.05em; white-space: nowrap;
  flex-shrink: 0;
}
.context-select { min-width: 240px; max-width: 360px; }
.context-add-btn { white-space: nowrap; flex-shrink: 0; }
.context-divider {
  flex: 1; min-width: 12px;
}
.meta-item { white-space: nowrap; font-size: 12px; color: var(--ink-soft); }
.meta-sep { color: var(--rule); flex-shrink: 0; }

/* ===== Action bar ===== */
.action-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.plan-status {
  margin-left: auto;
  border: 1px solid var(--rule);
  padding: 5px 10px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  white-space: nowrap;
}

.status-confirmed {
  background: rgba(20, 105, 78, 0.1);
  color: var(--success);
}

.status-draft {
  background: rgba(188, 125, 43, 0.12);
  color: var(--warning);
}

.summary-tile,
.panel {
  border: 1px solid var(--rule);
  background: var(--paper);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.summary-tile {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.summary-tile span,
.summary-tile small {
  color: var(--ink-soft);
  font-size: 12px;
}

.summary-tile strong {
  font-family: var(--font-serif);
  font-size: 22px;
  line-height: 1.15;
}

.summary-tile.accent {
  border-left: 4px solid var(--vermillion);
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.85fr);
  gap: 14px;
  align-items: start;
}

.panel {
  padding: 20px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 14px;
  margin-bottom: 16px;
}

.panel-head.compact {
  margin-bottom: 12px;
}

.panel-head h3 {
  margin: 0 0 4px;
  font-size: 18px;
}

.panel-head p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 13px;
}

.control-stack {
  display: grid;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--rule-soft);
}

.best-fit {
  padding: 14px 0;
  border-bottom: 1px solid var(--rule-soft);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.best-fit span,
.best-fit small {
  color: var(--ink-soft);
  font-size: 12px;
}

.best-fit strong {
  font-family: var(--font-serif);
  font-size: 30px;
}

.fit-table {
  display: flex;
  flex-direction: column;
}

.fit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid var(--rule-soft);
  padding: 12px 0;
}

.fit-row p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ink-mid);
  font-size: 13px;
}

.fit-row strong,
.plan-item strong {
  display: block;
  font-weight: 700;
}

.fit-row small,
.plan-item small {
  display: block;
  color: var(--ink-soft);
  margin-top: 4px;
}

.score {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 900;
}

.level-pill,
.role-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 24px;
  border: 1px solid var(--rule);
  font-size: 12px;
  font-weight: 700;
}

.level-a,
.role-main {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}

.level-b,
.role-support {
  background: rgba(20, 105, 78, 0.12);
  color: var(--success);
  border-color: rgba(20, 105, 78, 0.28);
}

.level-c,
.role-test {
  background: rgba(188, 125, 43, 0.12);
  color: var(--warning);
  border-color: rgba(188, 125, 43, 0.3);
}

.role-hold {
  background: var(--paper-dark);
  color: var(--ink-soft);
}

.risk {
  color: var(--vermillion) !important;
}

.script-line {
  color: var(--info) !important;
}

.empty-state,
.plan-placeholder {
  padding: 34px 20px;
  color: var(--ink-soft);
  background: var(--paper-dark);
  border: 1px dashed var(--rule);
}

.plan-hero {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  background: var(--paper-dark);
  border-left: 4px solid var(--ink);
}

.plan-hero span {
  color: var(--vermillion);
  font-size: 12px;
  font-weight: 700;
}

.plan-hero strong {
  font-family: var(--font-serif);
  font-size: 24px;
  line-height: 1.2;
}

.plan-hero small,
.plan-goal {
  color: var(--ink-soft);
}

.plan-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 14px 0;
}

.plan-metrics div {
  border: 1px solid var(--rule-soft);
  padding: 12px;
}

.plan-metrics span {
  display: block;
  color: var(--ink-soft);
  font-size: 12px;
  margin-bottom: 6px;
}

.plan-metrics strong {
  font-size: 18px;
}

.plan-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.plan-item {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  gap: 12px;
  border-top: 1px solid var(--rule-soft);
  padding-top: 14px;
}

.plan-item p {
  margin: 6px 0 0;
  line-height: 1.55;
  color: var(--ink-mid);
  font-size: 13px;
}

.order {
  width: 28px;
  height: 28px;
  background: var(--ink);
  color: var(--paper);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px;
}

.plan-editor {
  display: grid;
  gap: 12px;
}

.editable-item {
  grid-template-columns: 34px 1fr;
}

.editable-body {
  display: grid;
  gap: 12px;
}

.item-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.edit-grid {
  display: grid;
  grid-template-columns: 72px 110px repeat(3, minmax(100px, 1fr));
  gap: 10px;
}

.edit-grid label,
.wide-field {
  display: grid;
  gap: 5px;
}

.edit-grid span,
.wide-field span {
  color: var(--ink-soft);
  font-size: 12px;
}

.script-actions {
  display: flex;
  justify-content: flex-end;
}

.script-modal {
  min-width: 680px;
  max-width: 860px;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.modal-head p {
  margin: 4px 0 0;
  color: var(--ink-soft);
  font-size: 13px;
}

.script-textarea {
  resize: vertical;
  line-height: 1.75;
}

.create-session-modal {
  min-width: 560px;
}

.create-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 1200px) {
  .schedule-band,
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .edit-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .create-session-modal {
    min-width: 0;
    width: calc(100vw - 32px);
  }

  .create-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
