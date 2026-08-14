# AIops — 前端升级改造（aiops-platform-ui）

> 版本：v1.0 | 更新时间：2026-07-19 | 作者：lx
>
> **Vue2 + Element UI → Vue3 + Vite + TypeScript + Element Plus 全量升级改造**。在保持原有业务功能不变的前提下，完成技术栈现代化升级、TypeScript 类型安全、构建工具从 Webpack 迁移到 Vite。

---

# 一、升级背景与需求

## 1.1 为什么要升级

| 维度 | 升级前 | 升级后 |
|------|--------|--------|
| Vue 版本 | Vue 2.x（已停止维护） | Vue 3.4+（Composition API） |
| 构建工具 | Vue CLI + Webpack 5 | Vite 5（秒级热更新） |
| 类型系统 | JavaScript（无类型） | TypeScript（编译时类型检查） |
| UI 框架 | Element UI（Vue2 版） | Element Plus（Vue3 版） |
| 状态管理 | Vuex | Pinia |
| 路由 | Vue Router 3 | Vue Router 4 |
| 包管理 | npm | 与后端统一使用 `uv` |

**核心驱动力**：
- Vue 2 已于 2023 年底停止维护，安全漏洞不再修复
- Webpack 冷启动 30s+，Vite 秒级启动，开发体验质变
- TypeScript 在团队协作中避免大量运行时类型错误
- Element UI 不再更新，Element Plus 持续迭代

## 1.2 升级目标

- **功能零损失**：所有原有功能正常运行，用户无感知升级
- **类型安全**：所有 API 接口、路由配置、组件 Props 完成 TypeScript 类型定义
- **构建性能**：开发服务器启动 < 2s，HMR < 100ms
- **代码质量**：消除 Vue2 Options API → Vue3 Composition API 的混用

---

# 二、技术方案设计

## 2.1 技术栈对比

```
升级前                          升级后
────────────────────────────────────────────
Vue 2.7                        Vue 3.4+
Vue CLI 5                      Vite 5
Webpack 5                      esbuild + Rollup
Element UI 2.x                 Element Plus 2.x
Vuex 3                         Pinia 2
Vue Router 3                   Vue Router 4
JavaScript                     TypeScript 5
axios                          axios
ECharts 5                      ECharts 5
```

## 2.2 目录结构

```
aiops-platform-ui/
├── index.html                    # Vite 入口 HTML
├── package.json                  # 依赖管理
├── vite.config.ts                # Vite 配置
├── tsconfig.json                 # TypeScript 配置
├── .env.development              # 开发环境变量
├── .env.production               # 生产环境变量
├── .env.staging                  # 预发布环境变量
│
└── src/
    ├── App.vue                   # 根组件
    ├── main.ts                   # 应用入口（createApp + Pinia + Router）
    ├── env.d.ts                  # 类型声明
    │
    ├── api/                      # API 接口层（与后端一一对应）
    │   ├── user.ts               # 用户/登录 API
    │   ├── server.ts             # 服务器管理 API
    │   ├── patrol.ts             # 巡检 API
    │   ├── alarm.ts              # 告警 API
    │   ├── database.ts           # 数据库管理 API
    │   ├── backup.ts             # 备份 API
    │   ├── collector.ts          # 采集 API
    │   ├── statistics.ts         # 统计 API
    │   ├── ai.ts                 # AI 分析 API
    │   └── ...
    │
    ├── config/
    │   └── apiConfig.ts          # API 基础路径配置
    │
    ├── layout/                   # 布局组件
    │   └── components/
    │       ├── AppMain.vue       # 主内容区
    │       ├── Navbar.vue        # 顶部导航栏
    │       ├── Sidebar/          # 侧边栏（含 Logo/Item/Link）
    │       └── TagsView/         # 标签页导航
    │
    ├── router/
    │   └── index.ts              # 路由配置（动态路由 + 权限过滤）
    │
    ├── store/
    │   └── index.ts              # Pinia Store（用户状态/菜单/权限）
    │
    ├── views/                    # 页面视图
    │   ├── login/                # 登录页
    │   ├── dashboard/            # 仪表盘
    │   ├── server/               # 服务器管理
    │   ├── patrol/               # 巡检管理
    │   ├── alarm/                # 告警管理
    │   ├── database/             # 数据库管理
    │   ├── backup/               # 备份管理
    │   ├── collector/            # 数据采集
    │   ├── statistics/           # 统计分析
    │   ├── ai/                   # AI 分析
    │   ├── codegen/              # 代码生成器
    │   └── system/               # 系统管理（用户/角色/菜单/...）
    │
    ├── components/               # 公共组件
    │   ├── Breadcrumb/           # 面包屑导航
    │   ├── Hamburger/            # 侧边栏折叠按钮
    │   ├── SvgIcon/              # SVG 图标
    │   └── StatusDisplay.vue     # 状态标签
    │
    ├── composables/              # Vue3 Composition 复用逻辑
    │   └── useResizeHandler.ts   # 窗口尺寸监听
    │
    ├── icons/                    # SVG 图标资源
    │   └── svg/                  # dashboard/example/form/table/user/...
    │
    └── assets/                   # 静态资源
        └── 404_images/           # 404 页面图片
```

## 2.3 核心改造内容

### 2.3.1 Vue2 Options API → Vue3 Composition API

```vue
<!-- 升级前: Options API -->
<script>
export default {
  data() {
    return { tableData: [], loading: false }
  },
  mounted() { this.fetchData() },
  methods: { async fetchData() { ... } }
}
</script>

<!-- 升级后: Composition API + TypeScript -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

const tableData = ref<ServerItem[]>([])
const loading = ref(false)

onMounted(() => { fetchData() })

async function fetchData() {
  loading.value = true
  const res = await getServerList(params)
  tableData.value = res.data
  loading.value = false
}
</script>
```

### 2.3.2 路由动态权限

```
路由设计:
  constantRoutes     → 公共路由（login, 404）
  asyncRoutes        → 动态路由（根据后端返回的菜单动态添加）

登录流程:
  1. 用户登录 → 获取 token
  2. 携带 token 请求 userInfo → 获取 menus + permissions
  3. 前端根据 menus 动态生成路由表 → router.addRoute()
  4. 根据 permissions 控制页面按钮显隐
```

### 2.3.3 Element UI → Element Plus 迁移

```vue
<!-- 主要 API 变更 -->
<!-- 图标: -->
<i class="el-icon-search" />  →  <el-icon><Search /></el-icon>

<!-- 表单验证: -->
el-form :model → el-form :model   (API 基本兼容)

<!-- 表格列: -->
el-table-column prop="name" → el-table-column prop="name"  (一致)

<!-- 消息提示: -->
this.$message.success('成功') → ElMessage.success('成功')
this.$confirm('确认删除?') → ElMessageBox.confirm('确认删除?')
```

### 2.3.4 TypeScript 类型系统

```typescript
// api/user.ts — API 接口类型定义
interface LoginParams {
  username: string
  password: string
}

interface LoginResponse {
  token: string
  userInfo: UserInfo
  menus: MenuItem[]
  permissions: string[]
}

export async function login(params: LoginParams): Promise<LoginResponse> {
  return request.post('/auth/login', params)
}

// 路由类型
interface RouteMeta {
  title: string
  icon?: string
  hidden?: boolean
  permissions?: string[]
}
```

---

# 三、页面清单

## 3.1 认证与系统管理

| 页面 | 路由 | 功能 |
|------|------|------|
| 登录 | `/login` | 用户名/密码登录 |
| 仪表盘 | `/dashboard` | 服务器数/数据库数/巡检数/告警数 |
| 用户管理 | `/system/user` | 用户 CRUD + 角色分配 + 密码重置 |
| 角色管理 | `/system/role` | 角色 CRUD + 菜单权限分配 |
| 菜单管理 | `/system/menu` | 菜单树 CRUD |
| 部门管理 | `/system/dept` | 部门树 CRUD |
| 岗位管理 | `/system/post` | 岗位 CRUD |
| 公告管理 | `/system/announcement` | 公告 CRUD + 发布推送 |
| 登录日志 | `/system/loginLog` | 登录日志查询 |
| 操作日志 | `/system/operLog` | 操作日志查询 |

## 3.2 服务器与运维

| 页面 | 路由 | 功能 |
|------|------|------|
| 服务器管理 | `/server/list` | 服务器 CRUD + 状态同步 |
| 凭证管理 | `/server/credential` | SSH 凭证管理 |
| 巡检记录 | `/patrol/record` | 巡检记录查询 + 详情 |
| 巡检规则 | `/patrol/rule` | 告警规则配置 |
| 巡检配置 | `/patrol/config` | 服务巡检启停配置 |
| 告警管理 | `/alarm/list` | 告警查询 + 处理 |
| SSH 执行 | `/ssh/exec` | Web SSH 命令执行 |

## 3.3 数据库与备份

| 页面 | 路由 | 功能 |
|------|------|------|
| 数据库管理 | `/database/list` | 数据库资产 CRUD |
| 表结构 | `/database/table` | 表结构浏览 + 同步 |
| 备份策略 | `/backup/policy` | 备份策略配置 |
| 备份记录 | `/backup/record` | 备份记录查询 |
| 备份恢复 | `/backup/restore` | 备份恢复操作 |
| OSS 管理 | `/storage/oss` | 阿里云 OSS 文件管理 |
| COS 管理 | `/storage/cos` | 腾讯云 COS 文件管理 |
| 巡检配置 | `/database/checkConfig` | 数据库巡检配置 |
| 巡检记录 | `/database/checkRecord` | 数据库巡检记录 |

## 3.4 数据与分析

| 页面 | 路由 | 功能 |
|------|------|------|
| 数据采集 | `/collector/list` | 采集记录查询 |
| 统计分析 | `/statistics/overview` | 统计数据总览 |
| 数据分析 | `/statistics/analysis` | 数据分析与可视化 |
| AI 分析 | `/ai/analysis` | AI 智能分析 |
| AI 知识库 | `/ai/rag` | RAG 文档管理 |
| AI 日志分析 | `/ai/logAnalysis` | AI 日志分析 |
| DB 助手 | `/ai/dbAssistant` | 数据库 AI 助手 |
| 代码生成 | `/codegen` | CRUD 代码生成器 |

---

# 四、解决的问题

## 4.1 开发体验

- **Vite HMR**：修改代码后浏览器 **< 100ms** 热更新，对比 Webpack 的 2-5s 提高 20-50 倍
- **TypeScript 智能提示**：API 返回值有完整类型推导，IDE 自动补全不再靠记忆
- **`<script setup>`**：比 Options API 少写 40% 模板代码

## 4.2 运行时性能

- **Tree Shaking**：Vite + ES Module 实现更精准的 Tree Shaking，打包体积减少约 30%
- **Element Plus 按需导入**：只打包使用到的组件，不会引入整个 Element UI 库
- **Composition API 复用**：`useResizeHandler` 等 Composables 可在多个组件间共享逻辑

## 4.3 代码质量

- **编译时类型检查**：`tsc --noEmit` 在 CI 中拦截类型错误，避免 `undefined.map()` 等运行时崩溃
- **统一 API 类型**：`src/api/*.ts` 所有接口方法都有明确的入参/出参类型，前端后端类型一致性
- **ECharts 类型安全**：图表配置项有完整的 TS 类型定义，不再靠猜属性名

## 4.4 可维护性

- **Vue3 官方长期支持**：不再使用已停止维护的 Vue2 技术栈
- **Pinia 更简洁**：对比 Vuex 的 mutations/actions/getters 模式，Pinia 的 setup store 更直观
- **页面路由与后端菜单一致**：后端返回的菜单树直接映射前端路由，新增页面只需后端配置

---

# 五、环境配置

```bash
# .env.development
VITE_API_BASE_URL=http://127.0.0.1:2029
VITE_WS_URL=ws://127.0.0.1:2029

# .env.production
VITE_API_BASE_URL=https://aiops.example.com
VITE_WS_URL=wss://aiops.example.com

# 启动开发
cd aiops-platform-ui
npm install
npm run dev

# 生产构建
npm run build
```
