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
}

const auth = useAuthStore()
const router = useRouter()

const employeeId = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
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
  try {
    const { data } = await api.get('/auth/login-help')
    accounts.value = data.accounts || []
  } catch {
    // silent fail
  }
}

onMounted(fetchAccounts)
</script>

<template>
  <div class="login-page">
    <div class="login-shell">
      <!-- Left: Login form -->
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
              placeholder="默认密码: 123456"
              autocomplete="current-password"
            />
          </div>
          <div v-if="error" class="login-error">{{ error }}</div>
          <button type="submit" class="btn primary login-btn" :disabled="loading">
            {{ loading ? '登录中...' : '登 录' }}
          </button>
        </form>
        <div class="login-hint">
          默认密码: 123456
        </div>
      </div>

      <!-- Right: Account list -->
      <div v-if="accounts.length" class="account-panel">
        <div class="account-panel-header">
          <span>测试账号</span>
          <em>{{ accounts.length }} 个</em>
        </div>
        <div class="account-list">
          <button
            v-for="acc in accounts"
            :key="acc.employee_id"
            type="button"
            class="account-row"
            :class="{ active: selectedId === acc.employee_id }"
            @click="fillAccount(acc)"
          >
            <div class="account-row-main">
              <span class="acct-eid">{{ acc.employee_id }}</span>
              <span class="acct-name">{{ acc.employee_name }}</span>
            </div>
            <div class="account-row-meta">
              <span class="acct-dept">{{ acc.department }}</span>
              <span class="acct-pos">{{ acc.position }}</span>
            </div>
            <div class="account-row-roles">
              <span v-for="r in acc.roles" :key="r" class="acct-role">{{ r }}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; background: var(--paper);
  padding: 24px;
}

.login-shell {
  display: flex;
  gap: 32px;
  align-items: flex-start;
  max-width: 820px;
  width: 100%;
}

/* --- Left: login form --- */
.login-card {
  width: 400px;
  flex-shrink: 0;
  padding: 40px 32px;
  background: var(--paper-dark);
  border: 1px solid var(--rule-soft);
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
  margin: 24px auto 28px;
}
.login-error {
  padding: 8px 12px; margin-bottom: 14px;
  background: var(--vermillion-soft);
  color: var(--vermillion);
  font-size: 13px;
}
.login-btn {
  width: 100%;
  justify-content: center;
}
.login-hint {
  margin-top: 18px; text-align: center;
  font-size: 12px; color: var(--ink-soft);
  font-family: var(--font-mono);
}

/* --- Right: account panel --- */
.account-panel {
  flex: 1;
  min-width: 280px;
  max-height: 540px;
  display: flex;
  flex-direction: column;
  background: var(--paper-dark);
  border: 1px solid var(--rule-soft);
}

.account-panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--rule-soft);
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
}
.account-panel-header em {
  font-style: normal;
  font-weight: 400;
  font-size: 11px;
  color: var(--ink-soft);
}

.account-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.account-row {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 3px 12px;
  padding: 10px 12px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.account-row:hover {
  background: var(--paper);
  border-color: var(--rule-soft);
}
.account-row.active {
  background: var(--paper);
  border-color: var(--ink);
  box-shadow: inset 3px 0 0 var(--ink);
}

.account-row-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  grid-column: 1;
  grid-row: 1;
}
.acct-eid {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  min-width: 52px;
}
.acct-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.account-row-meta {
  display: flex;
  gap: 10px;
  grid-column: 2;
  grid-row: 1;
  align-self: center;
  justify-self: end;
}
.acct-dept,
.acct-pos {
  font-size: 11px;
  color: var(--ink-soft);
}
.acct-pos {
  font-style: italic;
}

.account-row-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  grid-column: 1 / -1;
  grid-row: 2;
}
.acct-role {
  display: inline-block;
  font-size: 10px;
  line-height: 1.5;
  padding: 1px 7px;
  background: var(--ink);
  color: var(--paper);
  font-weight: 600;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}

/* --- Responsive --- */
@media (max-width: 720px) {
  .login-shell {
    flex-direction: column;
    align-items: stretch;
    gap: 20px;
    max-width: 400px;
  }
  .login-card {
    width: 100%;
  }
  .account-panel {
    max-height: 320px;
  }
}
</style>
