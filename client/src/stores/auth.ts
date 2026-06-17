import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authAPI } from '../api'
import type { Employee } from '../types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const employee = ref<Employee | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<string[]>([])
  const initialized = ref(false)

  const isLoggedIn = computed(() => !!token.value)
  const userRole = computed(() => roles.value[0] || '')

  async function login(employeeId: string, password: string) {
    const { data } = await authAPI.login(employeeId, password)
    token.value = data.token
    employee.value = data.employee
    roles.value = data.roles
    permissions.value = data.permissions
    initialized.value = true
    localStorage.setItem('token', data.token)
  }

  async function fetchMe() {
    if (!token.value) return
    try {
      const { data } = await authAPI.me()
      employee.value = data.employee
      roles.value = data.roles
      permissions.value = data.permissions
      initialized.value = true
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = ''
    employee.value = null
    roles.value = []
    permissions.value = []
    initialized.value = false
    localStorage.removeItem('token')
  }

  return { token, employee, roles, permissions, initialized, isLoggedIn, userRole, login, fetchMe, logout }
})
