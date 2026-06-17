<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'

interface AccountInfo {
  employee_id: string
  employee_name: string
  department: string
  position: string
  roles: string[]
  permissions: string[]
}

const auth = useAuthStore()
const router = useRouter()

const employeeId = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const debugOpen = ref(false)
const accounts = ref<AccountInfo[]>([])
const selectedId = ref('')

async function handleLogin() {
  if (!employeeId.value || !password.value) {
    error.value = '请输入员工编号和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.login(employeeId.value, password.value)
    router.push('/dashboard')
  } catch (e: any) {
    error.value = e.response?.data?.message || '登录失败，请检查员工编号和密码'
  } finally {
    loading.value = false
  }
}

function fillAccount(acc: AccountInfo) {
  employeeId.value = acc.employee_id
  password.value = '123456'
  selectedId.value = acc.employee_id
  error.value = ''
}

async function fetchAccounts() {
  if (!auth.token) return  // Don't call authenticated endpoint without being logged in
  try {
    const { data } = await api.get('/auth/accounts')
    accounts.value = data.accounts
  } catch {
    // silent fail — debug panel won't show if API unavailable
  }
}

onMounted(fetchAccounts)
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        直播电商中台
        <span>LIVE COMMERCE HUB</span>
      </div>
      <div class="login-divider"></div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">员工编号</label>
          <input
            v-model="employeeId"
            type="text"
            class="form-input"
            placeholder="输入员工编号"
            autocomplete="username"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input
            v-model="password"
            type="password"
            class="form-input"
            placeholder="输入密码 (默认: 123456)"
            autocomplete="current-password"
          />
        </div>
        <div v-if="error" class="login-error">{{ error }}</div>
        <button type="submit" class="btn primary" style="width:100%;justify-content:center;" :disabled="loading">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </form>

      <!-- Debug account list -->
      <div v-if="accounts.length" class="debug-panel">
        <button class="debug-toggle" @click="debugOpen = !debugOpen">
          🔧 调试: 可用账号 ({{ accounts.length }}) {{ debugOpen ? '▲' : '▼' }}
        </button>
        <div v-if="debugOpen" class="debug-list">
          <div
            v-for="acc in accounts"
            :key="acc.employee_id"
            class="debug-row"
            :class="{ selected: selectedId === acc.employee_id }"
            @click="fillAccount(acc)"
          >
            <div class="debug-row-top">
              <span class="debug-eid">{{ acc.employee_id }}</span>
              <span class="debug-name">{{ acc.employee_name }}</span>
              <span class="debug-dept">{{ acc.department }}</span>
              <span class="debug-pos">{{ acc.position }}</span>
            </div>
            <div class="debug-row-tags">
              <span v-for="r in acc.roles" :key="r" class="badge badge-role">{{ r }}</span>
              <span v-for="p in acc.permissions" :key="p" class="badge badge-perm">{{ p }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="login-hint">
        测试账号: EMP001 ~ EMP006 / 密码: 123456
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; background: var(--paper);
}
.login-card {
  width: 460px; max-height: 95vh; overflow-y: auto;
  padding: 40px 36px;
  background: var(--paper-dark);
  border: 1px solid var(--rule-soft);
  border-radius: 2px;
}
.login-brand {
  text-align: center;
  font-family: var(--font-serif);
  font-size: 24px; font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin-bottom: 4px;
}
.login-brand span {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 400;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
  margin-top: 4px;
}
.login-divider {
  width: 40px; height: 2px; background: var(--ink);
  margin: 24px auto 32px;
}
.login-error {
  padding: 8px 12px; margin-bottom: 16px;
  background: var(--vermillion-soft);
  color: var(--vermillion);
  font-size: 13px; border-radius: 2px;
}
.login-hint {
  margin-top: 20px; text-align: center;
  font-size: 12px; color: var(--ink-soft);
  font-family: var(--font-mono);
}

/* Debug panel */
.debug-panel {
  margin-top: 24px;
  border-top: 1px solid var(--rule-soft);
  padding-top: 16px;
}
.debug-toggle {
  width: 100%;
  background: none;
  border: none;
  color: var(--ink-soft);
  font-size: 12px;
  font-family: var(--font-mono);
  cursor: pointer;
  padding: 4px 0;
  text-align: center;
  transition: color 0.15s;
}
.debug-toggle:hover {
  color: var(--ink);
}
.debug-list {
  margin-top: 10px;
  max-height: 340px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.debug-row {
  border: 1px solid var(--rule-soft);
  border-radius: 2px;
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.debug-row:hover {
  background: var(--paper);
  border-color: var(--rule);
}
.debug-row.selected {
  background: var(--paper);
  border-color: var(--ink);
}
.debug-row-top {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 13px; margin-bottom: 5px;
}
.debug-eid {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--ink);
  min-width: 52px;
}
.debug-name {
  font-weight: 600;
  color: var(--ink);
}
.debug-dept {
  color: var(--ink-soft);
  font-size: 12px;
}
.debug-pos {
  color: var(--ink-soft);
  font-size: 12px;
  font-style: italic;
}
.debug-row-tags {
  display: flex; flex-wrap: wrap; gap: 3px;
}
.badge {
  display: inline-block;
  font-size: 10px;
  line-height: 1.4;
  padding: 1px 6px;
  border-radius: 2px;
  white-space: nowrap;
}
.badge-role {
  background: var(--ink);
  color: var(--paper);
  font-weight: 600;
}
.badge-perm {
  background: var(--rule-soft);
  color: var(--ink-soft);
}
</style>
