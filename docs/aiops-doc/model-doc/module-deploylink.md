# 发布联动模块文档（DeployLink）

> **代码行数**: 1138 | **文件数**: 13 | **最后更新**: 2026-11-02

对接 Light Deploy 发布平台的模块：**发布期间开告警静默窗 + 接收发布生命周期事件**。
本模块只做两件事，不碰发布本身——发布的真值永远在平台侧，AIops 只负责「别把发布引起的预期内告警推给人」和「把发布时间线留下来」。

---

## 一、全景架构图

```
Light Deploy（发布平台）
  │
  │  POST /openapi/v1/silences            建窗（幂等，带自动过期）
  │  POST /openapi/v1/silences/{id}/close 关窗（幂等回放）
  │  POST /openapi/v1/deployment-events   上报发布事件（幂等）
  ▼
deps.require_service_token()          ← IP白名单 → Bearer令牌 → X-Service-Id，三道校验
  ▼
router/open_deploy.py（prefix=/openapi/v1）
  ├─ silence_service.create_silence / close_silence / extend_silence / get_silence
  │     └─ ops_deploy_silence（窗口：范围+类型+到期时间+关闭原因）
  └─ event_service.accept_event
        └─ ops_deploy_event（事件留存：类型/序号/版本/主机/状态/原始报文）
                ▲
                │  告警链路只读查询
opscenter/ops_alarm/alarm_service.create_alarm
  │
  └─ api/silence_query_api.is_silenced(server_id, alarm_type, content, host=server_ip)
        └─ silence_service.match_silence()
              ├─ ① 硬排除判定（磁盘/SSH/数据库/内核 → 永不静默）
              ├─ ② 时间窗（status=0 且 start ≤ now ≤ expire）
              ├─ ③ 服务器匹配（server_id 或 host，任一命中）
              └─ ④ 类型匹配（空或 * 表示全部）
        命中 → alarm.send_status = 3（抑制通知），告警仍入库、工单仍创建
```

---

## 二、目录与职责

```
aiops/deploylink/
├── constants.py                 事件类型字典（code→中文短名，后端唯一权威处，前端不复制）
├── deps.py                      服务间鉴权（IP 白名单 + 令牌 + 调用方标识）
├── util.py                      时间归一（aware→东八区 naive）、JSON 存取
├── model/
│   ├── ops_deploy_silence.py    静默窗表 + 建表 DDL（附文件末尾）
│   └── ops_deploy_event.py      发布事件表 + 建表 DDL
├── schemas/deploy_link.py       请求/响应模型，全部继承 BaseVO（蛇形入参、驼峰出参）
├── service/
│   ├── silence_service.py       建/关/延/查 + match_silence（匹配算法）+ 后台分页
│   └── event_service.py         事件接收 + 幂等去重 + 后台分页/详情
├── api/silence_query_api.py     跨模块查询入口（opscenter 只认这一层）
├── router/open_deploy.py        对外路由（服务间令牌），单独注册到 app 根路径
└── router/admin_deploy.py       管理后台路由（登录态，只读），挂进 admin_router
```

**为什么挂在 `/openapi` 而不是 `/admin`**：`/admin` 上有一层全局 `get_current_user`（JWT + Redis 会话），
服务调用方没有用户身份，挂进去必然 401。本路由单独注册到 app 根路径，改由 `require_service_token` 校验。

**为什么又有了 `admin_deploy.py`**：给人看的列表页需要登录态，且必须**只读**——
建窗/关窗/报事件只有发布链路能发起，页面补建会绕开幂等键与对端硬上限。两者是两个入口、同一套 service。

**为什么单独开 `api/` 层**：项目约定模块之间不得直接 import 对方的 model/service。
opscenter 的告警链路要判断「这条告警是否该静默」，只能通过 `api/silence_query_api` 调用。

---

## 三、数据模型

### 3.1 ops_deploy_silence（静默窗）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | varchar(20) | 主键 |
| `external_key` | varchar(150) | 幂等键，来自平台（`light-deploy:silence:<deploymentId>`） |
| `project_code` / `environment_code` | varchar(100) | 静默范围 |
| `server_ids` | json | 目标服务器 ID 列表（**平台自己的主键体系**） |
| `hosts` | json | 目标主机 IP 列表（**跨平台对齐靠它**） |
| `alert_categories` | json | 实际生效的告警类型，`["*"]` 表示全部 |
| `source` | varchar(50) | 调用方标识 |
| `status` | tinyint | 0 生效中 / 1 已关闭 / 2 已过期（2 按到期时间实时算出，不落库） |
| `start_time` / `expire_time` | datetime | 生效区间，`expire_time` 受硬上限截断 |
| `close_time` / `close_reason` | datetime / varchar(255) | 关闭留痕 |

唯一键 `uk_deploy_silence_external(external_key, is_deleted)`：并发重复建窗靠它兜底，
命中 `IntegrityError` 后回滚并按幂等回放，不会开出两个窗口。

### 3.2 ops_deploy_event（发布事件）

| 字段 | 说明 |
| --- | --- |
| `deployment_id` | 平台发布任务 ID |
| `event_id` | 平台本次投递标识（HTTP Idempotency-Key 同值） |
| `event_type` | `DEPLOYMENT_PREPARED` / `STARTED` / `HOST_SUCCESS` / `HOST_FAILED` / `SUCCEEDED` / `FAILED` / `SILENCE_CLOSED` / `ROLLBACK_SUCCEEDED` / `ROLLBACK_FAILED` / `CANCELLED` |
| `idempotency_key` | 业务幂等键，平台给或按 `deploymentId:eventType[:serverId]` 组装 |
| `sequence` | 同一发布内单调递增序号，按它还原时间线 |
| `version` / `previous_version` / `commit_id` | 版本与提交 |
| `server_id` / `host` | 主机级事件才有 |
| `status` | 短状态词：`PREPARED/RUNNING/SUCCESS/FAILED/CLOSED/ROLLED_BACK/CANCELED` |
| `occurred_at` / `receive_time` | 事件发生时间（平台给）/ 到达时间（服务端填） |
| `payload` | 原始报文 JSON，排障时对照用 |

建表脚本：`docs/sql/deploylink.sql`。

---

## 四、接口清单（前缀 `/openapi/v1`）

| 方法 | 路径 | 幂等 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | - | 连通性探测，返回 `{status,service,time,caller}` |
| POST | `/silences` | 按 `idempotency_key` | 建静默窗 |
| GET | `/silences/{id}` | - | 查详情（含 `expired` 实时判定） |
| POST | `/silences/{id}/close` | 按窗口状态 | 关窗，已关闭时回放 |
| PATCH | `/silences/{id}` | - | 延长到期时间（受硬上限截断） |
| POST | `/deployment-events` | 按 `idempotency_key` | 上报发布事件 |

鉴权（`deps.require_service_token`），顺序有意为之：

1. **来源 IP 白名单**放最前：公网扫描不该消耗令牌比较逻辑；
2. **令牌**：`Authorization: Bearer <DEPLOY_OPENAPI_TOKEN>`；
3. **调用方标识**：`X-Service-Id` 必须在 `DEPLOY_OPENAPI_SERVICE_IDS` 内（留空则不校验）。

响应统一 `StandardJSONResponse` 包壳：`{code,message,totalCount,data}`，**业务失败也返回 HTTP 200**，
调用方必须看 `code`。平台侧 `AiopsClient.unwrap()` 就是为此存在。

建窗响应示例：

```json
{
  "code": 200,
  "data": {
    "silenceId": "26326262184",
    "status": 0,
    "startAt": "2026-11-02T00:51:02",
    "expiresAt": "2026-11-02T01:31:02",
    "appliedCategories": ["服务异常"],
    "ignoredCategories": [],
    "duplicated": false
  }
}
```

---

## 四之二、管理后台接口与页面（只读）

给人看的入口，挂在 `/admin` 下（继承全局登录态），**全部只读**。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/deployLink/silence/list/{page}/{limit}` | 静默窗分页，状态按到期时间实时算 |
| GET | `/admin/deployLink/silence/detail/{silence_id}` | 静默窗详情（与 OpenAPI 同源） |
| GET | `/admin/deployLink/event/list/{page}/{limit}` | 发布事件分页（带 `eventTypeLabel`） |
| GET | `/admin/deployLink/eventTypes` | 事件类型字典（code + 中文短名，供筛选下拉） |
| GET | `/admin/deployLink/event/detail/{event_db_id}` | 单条事件，含完整报文 |

**后端不加 `require_perms`**：与 `sysOperLog` 同类，属于「历史留痕的只读视图」，登录态可见即可。
要收紧时补 `type=2` 按钮行 + `require_perms`——注意 `find_user_perms_list` 只收集 `type=2` 的 `perms`，
把权限码写在菜单行上不会生效，必然 403。

**排序两种口径**（`query_event_page`）：

- 带 `deploymentId` → `sequence` 升序：一次发布的时间线（同一秒会连落多条，按时间排会跳序）；
- 不带 → `receive_time` 倒序：最近发生了什么。

**状态筛选必须翻译成 SQL**（`query_silence_page`）：库里只存 `0 生效 / 1 已关闭`，
「已过期」要展开成 `status=0 AND expire_time < now`。直接按 `status` 列过滤，
会把早已到期的窗口显示成「生效中」，也会让「筛已过期」永远查不到数据。

### 前端页面

| 页面 | 文件 | 内容 |
| --- | --- | --- |
| 静默窗口 | `views/deploylink/silence/list.vue` | 项目/环境/状态/调用方筛选；主机与静默类型用标签展示；点「详情」看幂等键与服务器 ID |
| 发布事件 | `views/deploylink/event/list.vue` | 发布ID/类型/项目/主机筛选；点发布ID 直接切到该次发布的时间线；「报文」看原始 JSON |

API 层：`src/api/deploylink/deployLink.ts`。

**页面目录不写进 `router/index.ts`**：本项目菜单是后端驱动（`/admin/info` 返回 `routers`，
`permission.ts` 用 `import.meta.glob('./views/**/*.vue')` 解析 `component`）。
新增页面只需建 `.vue` + 在 `sys_menu` 登记一行 `type=1`，**component 填 `deploylink/silence/list`**
（不带 `views/` 前缀、不带 `.vue`）。

菜单脚本：`docs/sql/deploylink_admin_menu.sql`

```bash
mysql -u<user> -p ai_ops < docs/sql/deploylink_admin_menu.sql
```

脚本做三件事，全部幂等（可重复执行）：挂两个菜单到「运维中心」(id=4466329) 下；
按 `role_code IN ('CJGLY','YWGL','aiops-gly')` 授权；末尾一条 SELECT 校验菜单与授权条数。
**菜单不授权 = 侧边栏不出现**（`find_user_menu_list` 走 `sys_user_role → sys_role_menu`，没有超管硬编码放行）。

### 事件类型同步（唯一需要跨仓库手工对齐的地方）

事件类型的中文短名**只存在于两个后端**，前端一律消费后端下发：

| 位置 | 文件 | 作用 |
| --- | --- | --- |
| 平台侧 | `com.lx.deploy.aiops.model.AiopsEventType`（`getLabel`） | 平台联动抽屉、事件类型唯一权威定义 |
| AIops 侧 | `aiops/deploylink/constants.py` 的 `EVENT_TYPE_OPTIONS` | 后台列表/详情/筛选下拉 |

**编码（`DEPLOYMENT_*`）以平台为准**——它是对外契约，对端按 code 落库；中文名只是展示产物。
跨仓库无法共享代码，所以新增/改名事件类型时**必须同时改两处**，改完跑一次比对：

```bash
python3 - <<'EOF'
import io, re
java = io.open('<light-deploy>/src/main/java/com/lx/deploy/aiops/model/AiopsEventType.java', encoding='utf-8').read()
py = io.open('aiops/deploylink/constants.py', encoding='utf-8').read()
j = dict(re.findall(r'[A-Z_]+\(\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*\)', java))
p = dict(re.findall(r'\("([A-Z_]+)",\s*"([^"]+)"\)', re.search(r'EVENT_TYPE_OPTIONS.*?= \[(.*?)\]', py, re.S).group(1)))
print("编码集合相同:", set(j) == set(p), "| 中文名不一致:", {k: (j.get(k), p.get(k)) for k in set(j) | set(p) if j.get(k) != p.get(k)} or "无")
EOF
```

**为什么前端不写映射**：漏改的表现是「页面显示英文编码」，没有任何报错，没人会主动发现。
把它收敛到后端，至少字典和接口是同一份文件，改的人一定会看到。

---

## 五、静默匹配算法

`match_silence` 的判定顺序是有意设计的：

```
① 硬排除：alarm_type ∈ HARD_EXCLUDE_TYPES（内核）
          或 alarm_content 含 HARD_EXCLUDE_KEYWORDS（磁盘/SSH/数据库/MySQL/连接失败）
          → 直接返回 None，不静默
② 时间窗：status=0 且 start_time ≤ now ≤ expire_time
③ 服务器：server_ids 与 hosts 都为空 → 不限；
          否则 server_id 命中 server_ids 或 host 命中 hosts（任一即可）
④ 类型：  alert_categories 为空或含 "*" → 全部；否则 alarm_type 必须在内
```

**为什么①必须最先**：磁盘满、SSH 不可达、数据库故障即使落在窗口范围内也一律不静默。
这是防止「一次发布掩掉整机房故障」的底线，任何调用方都无法绕过（平台请求里的 `never_silence` 只是显式声明，
真正的否决权在服务端 `HARD_EXCLUDE_*`）。

**为什么③要双口径（2026-11-02 修正）**：Light Deploy 有自己的服务器主键体系，
与本平台 `ops_server.id` 不是同一套 ID。早期只按 `server_id` 匹配，导致平台建的窗口**永远命不中**——
窗口开得出来、日志也正常，就是不起作用（典型的静默失败）。现在同时比对 `hosts`，
平台传主机 IP、告警链路手里也有 `server_ip`，按主机对齐才靠得住。

### 告警链路接入点

`opscenter/service/ops_alarm/alarm_service.create_alarm`，在**通知派发之前**插入判定：

```python
silenced = None
try:
    silenced = await is_silenced(db=db, server_id=server_id, alarm_type=alarm_type,
                                 alarm_content=alarm_content, host=server_ip)
except Exception:
    log.exception(f"[创建告警] 静默窗判定失败，按未静默处理 - 告警ID:{alarm.id}")

if silenced is not None:
    alarm.send_status = SEND_STATUS_SILENCED   # 3
    await db.flush()
    return alarm                                # 跳过通知，工单与告警照常
```

三条不可动摇的约束：

1. **静默 ≠ 丢弃**：告警照常入库，只是 `send_status=3`，事后必须可查；
2. **工单照常创建**：抑制的只是通知，不是工单；
3. **判定必须旁路**：任何异常都按「未静默」处理，绝不能因为本模块故障导致告警不入库。

`send_status` 取值：`0 待发送 / 1 成功 / 2 失败 / 3 被发布静默抑制`。

---

## 六、配置（`.env`）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `DEPLOY_OPENAPI_TOKEN` | `light-deploy-dev-token` | 服务令牌，**生产必须覆盖** |
| `DEPLOY_OPENAPI_SERVICE_IDS` | `light-deploy,manual` | 调用方白名单，逗号分隔；留空只校验令牌 |
| `DEPLOY_OPENAPI_IP_WHITELIST` | 空 | 来源 IP 白名单；公网部署必须配置 |
| `DEPLOY_SILENCE_MAX_MINUTES` | 120 | 静默硬上限，平台请求无法突破 |
| `DEPLOY_SILENCE_EXCLUDE_TYPES` | `内核` | 类型级硬排除 |
| `DEPLOY_SILENCE_EXCLUDE_KEYWORDS` | `磁盘,disk,Disk,SSH,ssh,连接失败,数据库,MySQL` | 内容级硬排除 |

**鉴权顺序固定「IP 白名单 → 服务令牌 → 调用方标识」**（`deps.require_service_token`）：
IP 放最前面是有意的——公网扫描的垃圾请求在第一步就被挡掉，不消耗令牌比较逻辑。
通过后返回 `{"service_id", "client_ip"}`，业务层拿它写 `source` 与日志，用于区分「平台自动调用」和「人工手动调用」。
**`/admin/**` 不走这条通道**，走全局 `get_current_user`（JWT + Redis 会话），两套凭据互不复用。

---

## 七、联调与排障

### 7.1 服务间连通性

```bash
curl -H "Authorization: Bearer $DEPLOY_OPENAPI_TOKEN" -H "X-Service-Id: light-deploy" \
     http://127.0.0.1:2029/openapi/v1/health
```

| 返回 | 含义 |
| --- | --- |
| `code=200, data.status=UP` | 正常 |
| `code=208`（`LOGIN_AUTH`） | 缺少/格式错误的 Authorization |
| `code=209`（`PERMISSION`） | 令牌不正确、来源 IP 不在白名单、调用方标识不在白名单 |

### 7.2 验证窗口是否真的生效

```sql
-- 平台刚发布过一轮之后
SELECT id, external_key, project_code, environment_code, hosts, alert_categories,
       status, start_time, expire_time, close_reason
FROM ops_deploy_silence ORDER BY create_time DESC LIMIT 3;
```

再看告警是否被抑制：

```sql
SELECT id, server_id, alarm_type_name, send_status, create_time
FROM ops_alarm WHERE send_status = 3 ORDER BY create_time DESC LIMIT 20;
```

### 7.3 常见问题

| 现象 | 排查 |
| --- | --- |
| 平台日志报 `创建静默窗失败：…` | 先跑 7.1；再看平台与 AIops 的令牌、`X-Service-Id` 白名单是否一致 |
| 窗口建成了但告警照推 | ①`hosts` 里是不是实际的告警主机；②告警类型是否在 `alert_categories`；③内容是否命中硬排除关键词（看 `[发布静默]` 日志是否有 `命中发布窗口`） |
| 重复建窗产生两条 | 唯一键应拦住；若出现，检查平台幂等键是否带了 `deploymentId` |
| 窗口一直生效不关闭 | 平台关窗失败会等自然过期（≤120 分钟）；可手工 `POST /silences/{id}/close` |
| `[发布联动] 事件幂等命中` 大量出现 | 平台补偿任务在重试，属正常；平台侧 `aiops_event.retry_count` 可看次数 |

---

## 八、已知边界

1. 静默粒度为「主机 + 告警类型」，不精确到单个指标或服务实例。
2. 本模块不做发布决策：不触发回滚、不改告警等级，只压制通知与留痕。
3. 联动是单向的：本模块不回调平台，平台也不对本平台开放服务间接口。要定位「这条告警是哪次发布引起的」，
   靠静默窗（`external_key` 带 deploymentId）与事件表（带版本、主机、序号）自己拼。
4. 服务令牌是静态凭据，轮换需两侧同时改并重启；轮换窗口期内的调用会失败（平台侧 `fail_open` 保证发布不受影响）。
