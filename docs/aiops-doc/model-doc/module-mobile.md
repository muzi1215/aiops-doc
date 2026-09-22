# 移动端模块文档（Mobile）

> **代码行数**: 9715 | **文件数**: 63 | **最后更新**: 2026-09-22
> （统计范围：`aiops-mobile/src/**` 的 vue 29 / ts 30 / scss 2 / json 2，不含 `static/` 图标等静态资源）

> 子工程 `aiops-mobile/`（uni-app + Vue3 + TypeScript + Pinia），与后端 `aiops/`、PC 端
> `aiops-platform-ui/` 平级。本文档描述页面结构、调用链、接口契约与只读边界；
> 运行与打包操作见 [`aiops-mobile/README.md`](../aiops-mobile/README.md)，
> 功能范围界定与原型见 [`mobile-prototype/README.md`](mobile-prototype/README.md)。

---

## 一、全景架构图

```
┌ 页面层 pages/（24 个页面 / 5 个 tabBar）─────────────────────────────┐
│ tab  ：home 首页 · alarm 告警 · workOrder 工单 · patrol 巡检 · mine 我的
│ 二级 ：alarm/detail      workOrder/detail   patrol/detail
│        mine/profile      mine/password
│        aiAnalysis/index  aiAnalysis/report  aiChat/index  aiLog/list
│        statistics/index  collector/list     collector/detail
│        dbCheck/list      dbCheck/detail     database/list
│        database/detail   backup/list        backup/detail
└───────────────────────────┬──────────────────────────────────────────┘
                            │ onLoad（只跑一次）/ onShow（每次进页面）
                            ▼
┌ Store 层 store/（Pinia，4 个）───────────────────────────────────────┐
│ user       token + 用户信息 + buttons 权限点 → hasPerm / hasAnyPerm   │
│ directory  userId → username 映射（处理人/审核人 ID 必须转成用户名）   │
│ theme      auto / light / dark → 页面根 :class="themeClass"          │
│ analysis   AI 报告全文等大体量结果（不塞进页面 URL）                   │
└───────────────────────────┬──────────────────────────────────────────┘
                            ▼
┌ API 层 api/（15 个业务模块，统一调用 request()）─────────────────────┐
│ aiAnalysis aiLog alarm auth backup collector dashboard database      │
│ dbcheck patrol rag server statistics user workOrder                  │
└───────────────────────────┬──────────────────────────────────────────┘
                            ▼
┌ 请求层 api/request.ts ──────────────────────────────────────────────┐
│ uni.request({ url: `${getApiBase()}${options.url}` })                │
│   ↑ options.url 必须以 / 开头（见第五节 硬约束 1）                    │
│ 401        → removeToken() + reLaunch 登录页（登录接口可跳过）        │
│ code != 200→ toast 后 reject（silent: true 时只 reject 不弹）         │
└───────────────────────────┬──────────────────────────────────────────┘
                            ▼
后端 FastAPI  http://47.103.12.12:2029
统一响应壳：{ code, message, totalCount, data, page, limit }
```

---

## 二、完整调用链（从冷启动到工单列表显示处理人姓名）

### 2.1 Step 0：冷启动先预热用户目录

```ts
// src/App.vue:7  onLaunch()
useThemeStore().init()                          // 读本地主题偏好（storage key: aiops_theme）
if (getToken()) useDirectoryStore().load()      // src/App.vue:10
//   用户目录是「处理人/审核人显示用户名」的前置条件，
//   已登录就在启动时先拉一次，避免首个页面渲染时还显示 ID
```

### 2.2 Step 1：登录

```ts
// src/pages/login/index.vue:84  onLogin()
await userStore.login(form.username, form.password)        // :92
//   → store/user.ts:24  login()
//     → api/auth.ts:6   POST /login { username, password }（silent + skipAuthRedirect）
//     → 成功：this.token = token; setToken(token)          ← 写入 storage（key: aiops_token）
//     → 失败：抛错，由页面 catch 后 toast
useDirectoryStore().load()                                 // :95  登录后立刻补拉目录
await userStore.loadProfile().catch(() => undefined)       // :97  失败不阻塞进首页
//   → store/user.ts:32  loadProfile()
//     → api/auth.ts:15  GET /info
//     → 写入 id / name / avatar / buttons（按钮级权限点）/ profileLoaded
uni.switchTab({ url: '/pages/home/index' })                // :98
```

`pages/login/index.vue:64 onLoad` 另有一条分支：本地已有 token 时先调 `/info` 校验会话是否仍有效，
成功直接 `switchTab` 进首页，失败（401）则 `resetSession()` 留在登录页。

登录页有「演示账号：aiops / 123123」快捷填充条（模板 `pages/login/index.vue:42`，逻辑 `:79 fillDemo()`），
装机后可直接联调；页面**没有服务器地址输入框**，接口地址一律取自构建期的
`VITE_API_BASE_APP`（见 [`aiops-mobile/README.md`](../aiops-mobile/README.md)）。

### 2.3 Step 2：进入「我的工单」列表

```ts
// src/pages/workOrder/list.vue:162  onShow()
if (!userStore.isLogin) { uni.reLaunch('/pages/login/index'); return }
directory.load()            // :168  已 loaded 时直接 return，不重复请求
loadPending()               // 拉待办角标 GET /admin/workOrder/pendingStats
if (!loaded.value) reload() // :170
//   → list.vue:135  reload() → list.vue:115  fetchPage(1, false)
//     → api/request.ts:86  requestPage('/admin/workOrder/myList/1/20')
//       → request.ts:27  request(options)
//         → request.ts:34  uni.request({ url: `${getApiBase()}${options.url}` })
//           → request.ts:42  401 → redirectToLogin()：removeToken + reLaunch
//           → request.ts:60  body.code !== 200 → toast + reject
//       → 分页壳：记录取 res.data（数组），总数取外层 res.totalCount（见 request.ts:91-92）
```

### 2.4 Step 3：处理人 / 审核人 ID → 用户名

```ts
// src/pages/workOrder/list.vue:42-43
//   处理人 {{ directory.nameOf(item.handlerId) }}
//   审核人 {{ directory.nameOf(item.reviewerId) }}
//     → store/directory.ts:43  nameOf(id) → this.users[id] || id
//       ← 查不到时原样返回 ID（无权限或断网时的降级表现，不是 bug）

// store/directory.ts:21  load()
//   → api/user.ts:29  GET /admin/sysUser/findAll（silent: true，失败不弹 toast）
//   → 遍历 data：map[user.id] = user.username || user.name      // :29
//   → 失败：保持空表 + 记 lastFailAt，10 秒内不再重试             // :23
```

两个必须知道的细节：

1. **`url` 少了开头的 `/` 会导致这里静默失效**——接口地址是 `getApiBase() + url` 直接拼接，
   写成 `admin/sysUser/findAll` 会拼出 `http://47.103.12.12:2029admin/sysUser/findAll`，
   请求失败 → 用户表为空 → 全站处理人/审核人都显示成 ID（详见第五节 硬约束 1）。
2. **`id` 类型不一致也能对上**：`/admin/sysUser/findAll` 返回的 `id` 是字符串（如 `"413076"`），
   工单下发的 `handlerId` / `reviewerId` 是数字；`users` 用对象存、JS 的键天然是字符串，
   所以 `users[413076]` 能命中 `"413076"`。换数据结构（如 `Map`）时必须显式 `String(id)`。

工单详情页优先用后端字段、缺失时才回落目录：`pages/workOrder/detail.vue:31`
<!-- `{{ order.handlerName || directory.nameOf(order.handlerId) }}`， -->
审核人（`:35`）后端不下发姓名，固定走目录映射。

### 2.5 Step 4：权限点拦截（进页面之前先拦）

```ts
// src/pages/home/index.vue:250  openPage(url, perms, name)
if (!userStore.hasAnyPerm(perms)) { toast(`当前账号没有${name}权限`); return }
uni.navigateTo({ url })
//   → store/user.ts:54  hasAnyPerm()  →  :44  hasPerm()
//     两者在 buttons 为空时一律放行，避免后端未下发权限点的旧账号被误拦

// 调用点：:260 数据采集 bnt.opsCollector.list
//        :262 数据库巡检 bnt.opsDatabase.list / bnt.opsDatabaseCheckRecord.list
//        :267 数据库管理 bnt.opsDatabase.list
//        :269 备份任务   bnt.opsDatabaseBackup.list
//        :233 AI 分析    bnt.aiAnalysis.generate
//        :241 调用记录   bnt.llmInvokeLog.list
```

---

## 三、页面 × 接口 × 权限点完整矩阵

> 权限点列中的「入口拦截」表示只在首页入口用 `hasAnyPerm` 拦一道，页面本身不再校验。

| 页面 | 路由 | 主要接口（api 层函数） | 权限点 | 写操作 |
|------|------|----------------------|--------|--------|
| 登录 | `pages/login/index` | `login` `getInfo` | — | 否 |
| 首页 | `pages/home/index` | `getDashboardSummary` `listAlarms` `getPendingStats` | 入口拦截 | 否 |
| 告警中心 | `pages/alarm/list` | `listAlarms` | 入口拦截 | 否 |
| 告警详情 | `pages/alarm/detail` | `getAlarm` `getAlarmRelatedWorkOrder` | 入口拦截 | 否 |
| 我的工单 | `pages/workOrder/list` | `listMyWorkOrders` `listMyReviewWorkOrders` `getPendingStats` | — | 否 |
| 工单详情 | `pages/workOrder/detail` | `getWorkOrder` `listWorkOrderRecords` `getAlarmRelatedWorkOrder` `handleWorkOrder` `reviewWorkOrder` | — | **是**（处理 / 审核） |
| 巡检记录 | `pages/patrol/list` | `listPatrols` | 入口拦截 | 否 |
| 巡检详情 | `pages/patrol/detail` | `getPatrol` | 入口拦截 | 否 |
| AI 巡检告警分析 | `pages/aiAnalysis/index` | `findAllServers` `generateReport` | `bnt.aiAnalysis.generate` | 否（生成不落库） |
| 分析报告 | `pages/aiAnalysis/report` | `sendReportEmail` | `bnt.aiAnalysis.generate` | 是（发邮件 + 导出） |
| 知识库问答 | `pages/aiChat/index` | `ragChat`（仅「直接提问」模式） | — | 否 |
| 模型调用记录 | `pages/aiLog/list` | `listLlmInvokeLogs` | `bnt.llmInvokeLog.list` | 否 |
| 统计中心 | `pages/statistics/index` | `getPatrolStats` `getAlarmStats` `getWorkOrderStats` `getBackupStats` `getDbCheckStats` | 后端未挂权限点 | 否 |
| 数据采集 | `pages/collector/list` | `listCollectorRecords` `getCollectorConfig` `findAllServers` | 入口拦截 | 否（只读） |
| 采集详情 | `pages/collector/detail` | `getCollectorRecord` | 入口拦截 | 否 |
| 数据库巡检 | `pages/dbCheck/list` | `listDbCheckRecords` `getDbCheckOverallStats` | 入口拦截 | 否（只读） |
| 数据库巡检报告 | `pages/dbCheck/detail` | `getDbCheckRecord` | 入口拦截 | 否 |
| 数据库管理 | `pages/database/list` | `listDatabases` | 入口拦截 | 否（只读） |
| 数据库详情 | `pages/database/detail` | `getDatabase` `listDatabaseTables` `listBackups` | 入口拦截 | 否 |
| 备份任务 | `pages/backup/list` | `listDatabases` `listBackups` `getBackupStats` `getBackupPolicy` | 入口拦截 | 否（只读） |
| 备份详情 | `pages/backup/detail` | `getBackup` `getBackupLog` | 入口拦截 | 否 |
| 我的 | `pages/mine/index` | — | — | 否 |
| 个人资料 | `pages/mine/profile` | `getInfo` | — | 否 |
| 修改密码 | `pages/mine/password` | `sendPasswordCode` `changeMyPassword` | `bnt.sysUser.edit.password` | 是 |

**同名函数陷阱**：`getAlarmStats` 在两个模块里各有一个——
`api/alarm.ts` 的指向 `/admin/opsAlarm/stats`（告警总览），
`api/statistics.ts:117` 的指向 `/admin/statistics/alarm`（统计中心口径）。
两者返回值结构不同，导入时务必确认来源文件。

**知识库检索当前禁用**：服务端暂未提供向量模型，`pages/aiChat/index.vue:5` 的「知识库检索」
按钮固定为 `chip-disabled`，点击只提示「服务器资源紧张，无向量模型提供支持，请关注后续版本更新迭代」
（`RAG_UNAVAILABLE`，见 `:73`）；`useRag` 恒为 `false`，问答走 `ragChat(text, false)` 的
「直接提问」分支。后续服务端补齐向量模型时，去掉 `chip-disabled` 与 `onRagTap()` 的拦截即可恢复。

---

## 四、如何新增一个页面（完整步骤）

### 步骤 1：在 `src/pages.json` 注册路由

```json
{
  "path": "pages/xxx/list",
  "style": {
    "navigationBarTitleText": "页面标题",
    "enablePullDownRefresh": true,
    "backgroundColorTop": "#F0F2F5",
    "backgroundColorBottom": "#F0F2F5"
  }
}
```

只有 tabBar 上的 5 个页面（`home` / `alarm/list` / `workOrder/list` / `patrol/list` / `mine/index`）
才写进 `tabBar.list`，其余用 `uni.navigateTo` 打开。

### 步骤 2：写页面（`<script setup lang="ts">`）

```vue
<template>
  <view class="page" :class="themeClass">
    <view class="page-body"><!-- 内容 --></view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useThemeClass } from '@/utils/theme'

const themeClass = useThemeClass()
const loading = ref(false)

onShow(() => { /* 拉数据；需要登录态的页面先判 userStore.isLogin */ })
</script>
```

约定：不引入任何 UI 组件库，全部用 `view` / `text` 自绘 + `rpx` 单位；
颜色只取 `src/styles/theme.scss` 里的 CSS 变量（`var(--c-*)`），
页面根元素固定挂 `:class="themeClass"` 以支持深色模式。

### 步骤 3：在 `src/api/` 补接口函数

```ts
import { request, requestPage } from './request'

// 单条 / 详情
export function getXxx(id: string) {
  return request<XxxItem>({ url: `/admin/xxx/get/${id}` })
}

// 分页列表
export function listXxx(page: number, limit: number) {
  return requestPage<XxxItem>(`/admin/xxx/list/${page}/${limit}`)
}
```

**`url` 必须以 `/` 开头**，否则拼接出的地址错误（见第五节）。字段命名跟后端一致用驼峰。

### 步骤 4：权限点

1. 先确认后端路由挂的权限点（`aiops/**/router/*.py` 的 `@PreAuthorize`）；
2. 在首页入口用 `openPage(url, ['bnt.xxx.list'], '功能名')` 拦一道；
3. 页面内需要按钮级控制时用 `userStore.hasPerm('bnt.xxx.yyy')`；
4. 接口 403 时不要静默——列表页用 `list-state.vue` 展示空态并说明缺少的权限点
   （参考 `pages/aiLog/list.vue:47` 的文案写法）。

### 步骤 5：只读页面不得出现任何写入口

统计中心、数据采集、数据库巡检、数据库管理、备份任务这几类页面**只有查看与复制**：

- 不出现「触发 / 一键 / 立即 / 删除 / 保存」类按钮；
- 对应按钮位置用一行说明文字替代，如
  `pages/collector/list.vue:49`「移动端仅查看采集结果；触发采集与全量采集请在 PC 端「数据采集」执行」；
- 允许的操作只有「复制」（`utils/clipboard.ts` 的 `copyText`），如备份概览的「复制备份概览」。

### 步骤 6：校验

```bash
npm run type-check     # vue-tsc --noEmit，必须 0 错误
npm run dev:h5         # http://localhost:9860，浏览器里点一遍
```

---

## 五、三条硬约束

### 硬约束 1：API 层 `url` 一律以 `/` 开头

请求地址是 `getApiBase()` 与 `options.url` 的**字符串直接拼接**（`api/request.ts:34`），
没有做斜杠归一化。曾出现过 `src/api/user.ts` 三处漏写开头斜杠
（`admin/sysUser/findAll`），拼成 `http://47.103.12.12:2029admin/sysUser/findAll`，
结果用户目录永远拉不到、全站处理人/审核人显示成 ID，排查成本很高。

### 硬约束 2：移动端不做写操作（工单除外）

唯一的写操作是**工单的处理与审核**（`handleWorkOrder` / `reviewWorkOrder`，即告警处置闭环）
和**修改本人密码**。采集触发、数据库巡检触发、备份触发、记录删除等一律留在 PC 端。

`api/patrol.ts:13` 还留着 `manualStartPatrol`（触发巡检）的封装，但**没有任何页面调用**；
`api/rag.ts:42` 的 `listRagDocuments`、`api/collector.ts:87` 的 `listSystemConfig` 同理属于未接入接口。
新增页面时不要误把这三个接上去。

### 硬约束 3：权限点先拦再进

首页入口统一用 `hasAnyPerm` 拦截并 toast 提示，避免用户进了页面才收到一串 403。
拦截逻辑见 `pages/home/index.vue:250`。

---

## 六、关键文件速查

| 路径 | 作用 |
|------|------|
| `src/api/request.ts` | 唯一请求出口：拼地址 / 带 token / 401 跳登录 / 统一 toast |
| `src/utils/config.ts` | `getApiBase()`：读构建期注入的 `VITE_API_BASE_APP` |
| `src/utils/auth.ts` | token 本地存储（key：`aiops_token`） |
| `src/store/user.ts` | 登录态、`/info` 用户信息、`hasPerm` / `hasAnyPerm` |
| `src/store/directory.ts` | 用户目录 `userId → username`，工单处理人/审核人显示的核心 |
| `src/store/theme.ts` | 主题模式，`utils/theme.ts` 提供页面用的 `themeClass` |
| `src/store/analysis.ts` | AI 报告结果体（跨页面传递，避免塞 URL） |
| `src/pages/home/index.vue` | 首页大盘 + 所有二级入口的权限拦截 |
| `src/pages/workOrder/detail.vue` | 唯一的业务写操作页（处理 / 审核） |
| `src/components/list-state.vue` | 列表统一空态 / 错误态 / 加载态 |
| `src/components/stat-card.vue` | 指标卡 |
| `src/components/trend-bars.vue` | 自绘柱状趋势图（未引入 ECharts） |
| `src/utils/reportExport.ts` | 报告导出：Markdown → 带打印样式的 HTML → 浏览器打印为 PDF |
| `src/utils/format.ts` | 枚举与单位换算（`formatSeconds` 与 `formatDuration` 单位不同） |
| `src/styles/theme.scss` | 全部颜色令牌（`--c-*`），主题切换的唯一来源 |
| `src/pages.json` | 页面注册 + tabBar + 全局窗口样式 |
| `src/manifest.json` | 应用名 / appid / 版本 / Android 权限（`usesCleartextTraffic`） |

---

## 七、打包与分发

移动端有两条出包路径，产物都是 Android APK，接口地址均来自 `.env.production`
的 `VITE_API_BASE_APP`（构建期写死，换地址必须重新出包）。

| 方式 | 产物 | 说明 |
|------|------|------|
| HBuilderX 云打包 | 正式 APK | `npm run build:app` 出资源，再在 HBuilderX 里「发行 → 原生App-云打包」，**正式发布走这条** |
| Android 壳（`android-shell/`） | 快速测试包 | 本地 WebView 壳，不需要 HBuilderX；依赖 JDK + Android SDK（`platforms;android-34` + `build-tools;35.0.0`） |

分发：官网首页（仓库根目录 `index.html`）的「下载 App」按钮指向
`/download/aiops-mobile.apk`，APK 放在 nginx html 目录的 `download/` 子目录下。
nginx 需要给 `.apk` 补 MIME 类型，详细步骤见 [`download/README.md`](../download/README.md)。

---

## 八、与后端 / PC 端的边界

移动端**不直连数据库、不跨模块调用**，只通过 HTTP 访问后端已有接口，
因此新增页面时后端一般无需改动；确有无法绕过的需求（如历史 AI 报告回看），
按「服务端前置改造」处理，统一记在
[`aiops-mobile/README.md`](../aiops-mobile/README.md) 的「已知限制与后续待办」里，
不要散落在各页面注释中。

---

## 九、文档版本

| 日期 | 变更 |
|------|------|
| 2026-09-22 | 首版：24 个页面 / 15 个 API 模块 / 三条硬约束 / 打包与分发 |
