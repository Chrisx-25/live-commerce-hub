<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref } from 'vue'
import { getValueByPath, sortRows, type SortDirection, type SortState } from '../utils/tableSort'

type Column = { key: string; label: string; width?: string; sortable?: boolean }

const props = defineProps<{
  columns: Column[]
  data: T[]
  loading?: boolean
  rowClass?: string | ((row: T) => string)
}>()

const emit = defineEmits<{
  rowClick: [row: T]
  sortChange: [state: SortState | null]
}>()

defineSlots<{
  [name: string]: (props: { row: T; value: any }) => any
}>()

const sortState = ref<SortState | null>(null)

const sortedData = computed(() => sortRows(props.data, sortState.value))

const useFixedLayout = computed(() => props.columns.some(c => c.width))

function isSortable(col: Column) {
  return col.sortable !== false && col.key !== 'actions'
}

function sortAria(col: Column) {
  if (!isSortable(col)) return undefined
  if (sortState.value?.key !== col.key) return 'none'
  return sortState.value.direction === 'desc' ? 'descending' : 'ascending'
}

function toggleSort(col: Column) {
  if (!isSortable(col)) return
  if (sortState.value?.key === col.key) {
    const direction: SortDirection = sortState.value.direction === 'desc' ? 'asc' : 'desc'
    sortState.value = { key: col.key, direction }
    emit('sortChange', sortState.value)
    return
  }
  sortState.value = { key: col.key, direction: 'desc' }
  emit('sortChange', sortState.value)
}

function getCellValue(row: T, key: string) {
  return getValueByPath(row, key)
}

function getRowClass(row: T) {
  if (!props.rowClass) return ''
  return typeof props.rowClass === 'function' ? props.rowClass(row) : props.rowClass
}
</script>

<template>
  <div class="table-wrap">
    <table :class="{ 'table-fixed': useFixedLayout }">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :style="col.width ? { width: col.width } : {}"
            :aria-sort="sortAria(col)"
            :class="{ sortable: isSortable(col), sorted: sortState?.key === col.key }"
          >
            <button
              v-if="isSortable(col)"
              type="button"
              class="sort-header"
              @click="toggleSort(col)"
            >
              <span>{{ col.label }}</span>
              <span class="sort-indicator">
                {{ sortState?.key === col.key ? (sortState.direction === 'desc' ? '↓' : '↑') : '↕' }}
              </span>
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length" style="text-align:center;padding:40px;color:var(--ink-soft);">
            加载中...
          </td>
        </tr>
        <tr v-else-if="data.length === 0">
          <td :colspan="columns.length" style="text-align:center;padding:40px;color:var(--ink-soft);">
            暂无数据
          </td>
        </tr>
        <tr v-for="(row, idx) in sortedData" :key="idx" :class="getRowClass(row)" @click="$emit('rowClick', row)" style="cursor:pointer;">
          <td v-for="col in columns" :key="col.key">
            <slot :name="'cell-' + col.key" :row="row" :value="getCellValue(row, col.key)">
              {{ getCellValue(row, col.key) }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
table {
  width: 100%;
}

/* Only use fixed layout when column widths are explicitly set */
.table-fixed {
  table-layout: fixed;
}

/* Allow text wrapping in cells — overrides global white-space:nowrap */
.table-fixed th,
.table-fixed td,
th, td {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
  vertical-align: middle;
}

.sort-header {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: inherit;
  white-space: nowrap;
}

th.sortable:hover {
  color: var(--ink);
}

th.sorted {
  color: var(--ink);
}

.sort-indicator {
  font-size: 10px;
  color: var(--ink-soft);
}
</style>
