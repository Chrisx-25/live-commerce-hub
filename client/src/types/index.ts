// Shared types for the application

export interface User {
  user_id: string
  platform_user_id: string
  nickname: string
  gender: string
  user_level: string
  register_platform: string
  purchase_count: number
  total_consumption: number
  last_active_time: string
  create_time: string
}

export interface Employee {
  employee_id: string
  employee_name: string
  department: string
  position: string
  phone: string
  email: string
  status: string
  join_date: string
}

export interface Product {
  product_id: string
  product_name: string
  category: string
  brand: string
  cost_price: number
  sale_price: number
  gross_profit_rate: number
  product_status: string
  supplier_id: string
  description?: string
  selling_points?: string
  create_time: string
}

export interface SKU {
  sku_id: string
  product_id: string
  sku_name: string
  color: string
  size: string
  specification: string
  stock_quantity: number
  warning_threshold: number
  sales_volume: number
  sku_status: string
}

export interface Supplier {
  supplier_id: string
  supplier_name: string
  contact_person: string
  contact_phone: string
  address: string
  cooperation_status: string
  supplier_score: number
  delivery_cycle: number
}

export interface Anchor {
  anchor_id: string
  anchor_name: string
  gender: string
  join_date: string
  account_platform: string
  fan_count: number
  specialization: string
  anchor_level: string
  status: string
}

export interface LiveSession {
  live_id: string
  anchor_id: string
  anchor_name?: string
  live_title: string
  start_time: string
  end_time: string | null
  platform: string
  live_category: string
  live_status: string
  online_peak: number | null
  total_sales: number
}

export interface Script {
  script_id: string
  product_id: string
  product_name?: string
  live_id: string | null
  anchor_id: string | null
  script_title: string
  script_content: string
  script_type: string
  tags: string
  conversion_rate: number | null
  recommendation_level: string | null
  create_time: string
}

export interface Order {
  order_id: string
  user_id: string
  live_id: string
  sku_id: string
  original_price: number
  discount_amount: number
  order_quantity: number
  order_amount: number
  payment_status: string
  order_status: string
  order_time: string
}

export interface InteractionLog {
  interaction_id: string
  live_id: string
  user_id: string
  interaction_type: string
  interaction_content: string
  interaction_time: string
  sentiment_label: string | null
  semantic_label: string | null
  confidence_score: number | null
  purchase_intention: string | null
  analysis_status: string
}

export interface Inventory {
  inventory_id: string
  sku_id: string
  sku_name?: string
  warehouse_name: string
  batch_number: string
  current_stock: number
  safety_stock: number
  inventory_status: string
  last_update_time: string
}

export interface PurchaseOrder {
  purchase_id: string
  supplier_id: string
  supplier_name?: string
  sku_id: string
  sku_name?: string
  purchase_quantity: number
  purchase_price: number
  purchase_status: string
  expected_arrival_time: string
  actual_arrival_time: string | null
  purchaser_id: string
  create_time: string
}

export interface AnchorPerformance {
  performance_id: string
  anchor_id: string
  live_id: string
  conversion_rate: number
  average_watch_time: number
  interaction_rate: number
  script_execution_score: number
  performance_score: number
  evaluation_time: string
}

export interface AfterSale {
  aftersale_id: string
  order_id: string
  aftersale_type: string
  problem_description: string
  process_status: string
  refund_amount: number
  complaint_level: string
  create_time: string
}

export interface OperationReport {
  report_id: string
  report_type: string
  report_title: string
  report_content: string
  creator_id: string
  create_time: string
  statistical_period: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface LoginRequest {
  employee_id: string
  password: string
}

export interface LoginResponse {
  token: string
  employee: Employee
  roles: string[]
  permissions: string[]
}

export interface DashboardScope {
  type: 'anchor' | 'global'
  anchorName?: string
  anchorId?: string
}

export interface DashboardSummary {
  totalGmv: number
  totalOrders: number
  avgConversionRate: number
  totalProducts: number
  stockAlertCount: number
  dailyAvgGmv: number
  dailyAvgOrders: number
  gmvChange: number
  ordersChange: number
  conversionChange: number
  scope?: DashboardScope
  period?: {
    label: string
    startDate: string
    endDate: string
    compareLabel: string
    stockSnapshotLabel: string
  }
}

export interface TrendData {
  date: string
  gmv: number
  orders: number
}
