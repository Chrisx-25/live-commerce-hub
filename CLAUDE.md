# live-commerce-hub — 直播电商数字化运营管理系统

## Quick Facts
- Stack: Vue 3 + TypeScript + Vite 8 + Pinia (frontend) | Node.js + Express + TypeScript (backend)
- UI: 自建设计系统 (design-system.css) + Chart.js + Lucide Vue 图标
- DB: Microsoft SQL Server (localhost:1433, `live_commerce_hub`)
- Auth: JWT (bcryptjs + jsonwebtoken)
- AI: DeepSeek API (`deepseek-chat`, 兼容 OpenAI SDK)
- Package: npm (concurrently 同时启动前后端)

## Key Commands
```bash
# 根目录
npm run dev              # 同时启动前后端 (concurrently)
npm run build            # 构建前后端
npm run test:acceptance  # 跑全部验收测试

# 后端 (server/)
cd server && npm run dev              # tsx watch 热重载 :3000
cd server && npm run migrate          # 运行 Knex 数据库迁移 (仅新增表, 不删数据)
cd server && npm run db:reset         # 🔄 数据库复位 — 从备份恢复 (安全!!)
cd server && npm run db:backup        # 💾 导出当前数据量快照
cd server && npm run db:regenerate    # ⚠️ 全库清空+随机重建 (仅开发/需改表结构)
cd server && npm run seed             # ⚠️ 填充基础种子数据 (会清空基础表!)
cd server && npm run seed:acceptance  # ⚠️ 填充验收测试数据 (会清空全库!)
cd server && npm run test:acceptance  # 后端验收测试
cd server && npx tsx db-restore.ts --list  # 列出所有可用备份
cd server && npx tsx db-snapshot.ts --save  # 导出数据量快照 (手动)

# 前端 (client/)
cd client && npm run dev              # Vite 热重载 :5173
cd client && npm run build            # 生产构建
```

## Architecture
```
server/src/
├── index.ts           ← 入口 (Express 监听 :3000)
├── app.ts             ← Express app 配置
├── config.ts          ← 环境变量读取
├── middleware/        ← auth (JWT校验) + errorHandler
├── routes/            ← 17 个路由模块
│   ├── auth.ts, dashboard.ts, products.ts, anchors.ts
│   ├── liveSessions.ts, monitor.ts, scripts.ts
│   ├── inventory.ts, purchases.ts, orders.ts
│   ├── selection.ts, reports.ts, afterSales.ts
│   └── system.ts, anchorPerformance.ts, ...
├── services/          ← 业务逻辑层
│   ├── anchorProductFitEngine.ts, inventoryPlanning.ts
│   ├── liveSimulator.ts, liveReviewEngine.ts, selectionEngine.ts
│   └── anchorProductPlanningService.ts
└── db/
    ├── knexfile.ts    ← MSSQL 连接配置
    ├── migrations/    ← 3 个 migration (24 张表)
    └── seeds/         ← 种子数据

client/src/
├── main.ts            ← Vue 入口
├── App.vue            ← 根组件
├── router/            ← Vue Router 路由 (12 页面)
├── stores/auth.ts     ← Pinia 认证状态
├── api/index.ts       ← Axios 实例 + 拦截器
├── pages/             ← 12 个页面组件
│   ├── DashboardPage   — KPI卡片 + 趋势图 + TOP5
│   ├── ProductsPage    — 列表/搜索/CRUD/排序
│   ├── AnchorsPage     — 列表/详情弹窗/雷达图/多主播对比
│   ├── LiveSessionsPage— 直播场次管理
│   ├── MonitorPage     — 直播监控 (实时弹幕/情绪/AI话术)
│   ├── ScriptsPage     — AI脚本生成 (预览后保存)
│   ├── SelectionPage   — 选品排名/关联推荐
│   ├── ReportsPage     — 运营报告
│   ├── InventoryPage   — 库存预警
│   ├── PurchasingPage  — 采购状态流转
│   ├── AfterSalePage   — 售后工单
│   └── AnchorProductPlanningPage — 主播选品规划
├── components/        ← 通用组件
│   ├── AppSidebar     — 12菜单侧边栏
│   ├── DataTable      — 通用数据表格 (含排序)
│   ├── KpiCard, PageHeader, StatusBadge, Pagination
└── utils/             ← 工具函数 (含测试)

```

## Conventions
- API 调用统一走 `client/src/api/index.ts` 里的 Axios 实例
- 路由定义在 `client/src/router/index.ts`，所有页面级组件在 `pages/`
- 后端路由 `/api/<resource>` 格式，`/api/auth/login` 为白名单
- 全局样式 `design-system.css`，body 设置 `user-select: none`
- 自定义 UI 组件替代原生元素（确认框、下拉面板、勾选框）
- TypeScript: server 用 ts 5.6，client 用 ts 6.0

## MSSQL Database
- 28 张表（含 LiveSessionReview, LivePlan, LivePlanItem, AnchorProductFit 扩展表）
- 连接配置: `trustServerCertificate: true`, `encrypt: false`（本地开发）
- Migration 用 Knex（4 个迁移文件），**不要直接改表结构**（需改表时新建 migration）
- **RBAC 权限矩阵** (69 行 RolePermission): 管理层=16, 运营=16, 采购=5, 仓储=5, 主播=7, 管理员=20
- **001 seed 配置**: 第一个主播=王凯乐, EMP005=王凯乐+anchor_id, 所有员工密码=123456

### 数据库复位 (db:reset) — 安全恢复机制

```
npm run db:reset   →   从备份文件恢复全库 (db-restore.ts)
```

- **备份文件（仓库内）**: `server/db-backups/live_commerce_hub_2026-06-17.bak.gz` (42MB, gzip 压缩，已纳入 Git)
- **解压后**: `server/db-backups/live_commerce_hub_2026-06-17.bak` (158MB, 28表)
- **恢复方式**: `db-restore.ts` 自动检测 `.bak.gz`，先解压再通过 sqlcmd RESTORE DATABASE WITH REPLACE 恢复
- **前置条件**: MSSQL 运行中，sa 密码正确（从 .env 读取）
- **注意事项**: 恢复期间自动断开所有连接 (SINGLE_USER)，恢复后需重启后端
- **列出备份**: `npx tsx db-restore.ts --list`
- **手动指定备份**: `npx tsx db-restore.ts --bak <path>`（支持 .bak 和 .bak.gz）

#### 队友上手（任选一种）

**方式一：用 Claude Code（推荐）**
在项目目录打开 Claude Code，直接说：
> "帮我初始化这个项目：装依赖、配 .env、恢复数据库、启动"

Claude 会读这份文档自动执行。

**方式二：手动安装**
```bash
# 首次
git clone https://github.com/Chrisx-25/live-commerce-hub.git && cd live-commerce-hub
bash setup.sh      # 一键：装依赖 + 配 .env + 恢复数据库
npm run dev        # 启动

# 日常更新
git pull && cd server && npm run db:reset && cd .. && npm run dev
```
`git pull` 同时拉代码和数据库备份，`db:reset` 把备份灌进 MSSQL。

### 数据库生成 (db:regenerate) — 仅开发/改表结构时使用

```
npm run db:regenerate   →   migrate → seed → LLM增强 (全库清空+随机重建)
```

- ⚠️ **此操作会清空全部数据并随机重建，耗时 10-15 分钟**
- 生成流程: Migrations(4) → 001 seed(基础结构: 26主播/6员工/300场次/8000用户/RBAC/供应商) → LLM增强(14 phases: 商品名/描述/脚本/订单/弹幕/库存/绩效/报告)
- **LLM 缓存**: `server/src/db/seeds/llm-*.json` (商品名/供应商/弹幕模板)，Phase 1-3 使用缓存无 API 调用
- **如需保留当前数据**: 先运行 `npm run db:backup` 导出快照，再考虑是否需要创建新备份文件

### 数据库破坏性操作风险等级

| 命令 | 风险 | 说明 |
|------|------|------|
| `npm run db:reset` | 🟢 安全 | 从备份恢复，不丢数据 |
| `npm run db:backup` | 🟢 安全 | 只读快照 |
| `npm run db:regenerate` | 🔴 全库销毁 | 清空+随机重建，仅在开发/改表结构时使用 |
| `npm run seed` | 🔴 基础表销毁 | 清空并重建基础数据（直播/商品/主播等） |
| `npm run seed:acceptance` | 🔴 全库销毁 | 替换为小规模测试数据 |
| `npm run migrate:rollback` | 🔴 删表 | 回滚最近一次 migration（可能删表） |
| `npx tsx llm-enhance-seed.ts` | 🔴 业务表销毁 | 清空并重建 13 张业务表（订单/弹幕等） |

## Change Log

| 日期 | 变更 | 影响范围 |
|------|------|---------|
| 2026-06-17 | **数据库备份节点更新**: 备份 42MB (158MB解压), 28表全量数据；修复 34 场已排期但无计划的场次；新增队友更新指令 | `server/db-backups/`、`CLAUDE.md` |
| 2026-06-17 | **数据库安全加固**: `db:reset` 改为从备份恢复 (安全!!)；新增 `db:regenerate` (旧 destructive 重建)、`db:backup` 快照命令、`db-restore.ts` 恢复工具；LoginPage 401 死循环修复；场次安排 DESC 排序修复 | `server/package.json`、`CLAUDE.md`、`LoginPage.vue`、`AnchorProductPlanningPage.vue` |
| 2026-06-17 | **数据库管理规范化**: 001 seed 修正 RBAC 映射(16/16/5/5/7/20)、王凯乐为第一主播、EMP005 关联 anchor_id；新增 `npm run db:reset` 统一重置命令；新增 `db-snapshot.ts` 快照工具；删除 `run-full-seed.ts` 补丁脚本 | `server/` |
| 2026-06-17 | **数据库初始化修复**: 运行 `llm-enhance-seed.ts` 补全 LLM 增强数据（商品名/描述/脚本/订单等），解决占位符 "爆款候选产品" 问题 | 全库 |
| 2026-06-17 | **Dashboard 周期筛选修复**: `/api/dashboard/top-anchors` 从全量统计改为按 `[Order].order_time` 时间段过滤，三个指标（主播/商品/GMV占比）均正确响应周期切换 | `server/src/routes/dashboard.ts` |
| 2026-06-17 | **直播监控图表初始修复**: `createWarmupSeries` 仅在恢复进行中的直播时生成预热数据，新开模拟从空图表开始；新增立即推送首个数据点，图表不再空白等待 6 秒 | `server/src/services/liveSimulator.ts` |
| 2026-06-17 | **选品趋势 SQL 修复**: `getCategoryTrends` 嵌套聚合子查询不兼容 MSSQL（`'sum' is not a recognized aggregate function`），改写为 LEFT JOIN + COUNT DISTINCT + SUM 直接聚合 | `server/src/services/selectionEngine.ts` |
| 2026-06-17 | **四个待完善页面验证通过**: 直播场次（列表/创建/编辑）、选品分析（排名/关联推荐/顾问报告）、运营报告（列表/报告查看）、售后工单（列表/状态流转）— API 和前端页面均正常工作 | 全栈 |
| 2026-06-17 | **主播数据修复**: Anchor 表 12 行随机名（林夏/周野等）UPDATE 为知名主播（李佳琦/薇娅/罗永浩等），保留 anchor_id 避免外键级联 | DB: Anchor 表 |
| 2026-06-17 | **脚本推荐等级统一**: Script.recommendation_level 32 条 'A' 统一为 '高'（B→中、C→低），前端 badge class 改为语义化 rec-high/mid/low | DB: Script 表 + `ScriptsPage.vue` |
| 2026-06-17 | **DataTable 条件式固定布局**: 仅当 columns 设 width 时启用 `table-layout:fixed`；td/th 覆盖全局 `white-space:nowrap` 允许折行 + `overflow-wrap:break-word` | `DataTable.vue` |
| 2026-06-17 | **全部列表页列宽优化**: ProductsPage(9列)/ScriptsPage(7列)/AnchorsPage(9列)/InventoryPage(10+9列)/PurchasingPage(7+7列)/AfterSalePage(7列)/LiveSessionsPage(9列)/ReportsPage(6列) 均按最大内容长度分配 width，最小化折行 | 8 个页面组件 |
| 2026-06-17 | **Dashboard 高密度重设计**: 系统性收紧纵向间距 ~400px（KPI卡片内边距-40%/数值40→30px、图表280→185px、全局gap从24-40px收至10-14px、page-header/padding-bottom收紧），1080p 屏幕一屏完整呈现无需滚动 | `DashboardPage.vue` |
| 2026-06-17 | **场次安排页面重构**: 删除三个教程性质工作流卡片（生成排品草案/人工审查/确认排期）；"新增场次"按钮提升至与场次选择器等位的上下文栏；session-context 改为单行流式布局（flex:1弹簧分隔） | `AnchorProductPlanningPage.vue` |
| 2026-06-17 | **侧栏导航重排**: 运营工作台按直播业务管线重排（数据总览→直播场次→场次安排→选品分析→直播复盘）；履约与复盘按供应链流向重排（采购→库存→售后→报告） | `AppSidebar.vue` |
| 2026-06-17 | **选品分析排序去重**: 删除品类筛选旁的独立排序下拉框，排序统一通过 DataTable 表头点击完成，消除两套排序机制冲突 | `SelectionPage.vue` |

## Known Gotchas
- .env 文件需要在 `server/` 目录下（从 `.env.example` 复制）
- MSSQL 必须已安装并运行在 localhost:1433
- 默认账号: EMP001 / 123456
- LLM 脚本生成依赖 DeepSeek API（`server/src/services/` 下各 engine）
- `npm run dev` 在根目录执行（concurrently 管理前后端进程）
- liveSimulator 在 server 启动时自动恢复活跃的直播模拟
- 验证计划完整记录在 `验证计划.md`（含种子数据量核对表 + 问题修复记录）
- **数据库复位**: 数据异常需要恢复时运行 `cd server && npm run db:reset`，从备份文件 `db-backups/live_commerce_hub_2026-06-17.bak.gz` (42MB 压缩包 / 解压后 158MB, 28表) 恢复，耗时约 10 秒。恢复后需重启后端。
- **数据库备份恢复**: 
  - 备份文件: `server/db-backups/live_commerce_hub_2026-06-17.bak.gz` (42MB, 28表)
  - 恢复命令: `npm run db:reset` (推荐) 或手动 `npx tsx db-restore.ts --bak <path>`
  - 数据快照: `server/snapshot-*.json` (行数参照表)

### MSSQL 本地开发环境恢复流程

如果 sa 密码丢失或登录失败，按以下步骤用 Windows 集成认证修复：

```bash
# 1. 用 Windows 认证连本机（需要管理员权限的终端）
sqlcmd -S localhost -E

# 2. 在 sqlcmd 中启用 sa 并重置密码
ALTER LOGIN sa ENABLE;
ALTER LOGIN sa WITH PASSWORD = 'a123456';
GO

# 3. 确认混合认证模式已开启
EXEC xp_instance_regread
    N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer',
    N'LoginMode';
GO
-- LoginMode = 2 表示混合认证（SQL + Windows）
-- LoginMode = 1 表示仅 Windows 认证，需要改为 2

# 4. 确认数据库存在
SELECT name FROM sys.databases WHERE name = 'live_commerce_hub';
GO
```

> **前置条件**：当前 Windows 用户需在 SQL Server 中有 sysadmin 角色。
> 连接成功后，项目的 `.env` 配置为 `DB_USER=sa` / `DB_PASSWORD=a123456`。
