# 配置中心模块文档（Configuration Center）

> **代码行数**: 898 | **文件数**: 13 | **最后更新**: 2026-08-02

---

## 一、全景架构

```
前端配置页面 (systemConfig/index.vue)
  │ PUT /admin/system/config  { "config_key": "patrol_cron", "config_value": "*/10" }
  ▼
system_config_router.py（路由层 — 仅参数校验 + 调 Service）
  │
  │  ConfigService.set_config(db, key, value)
  ▼
ConfigService（单例核心）
  ├── 写 MySQL: UPDATE ops_system_config SET config_value='*/10'
  ├── 写 Redis: SET aiops:config:patrol_cron "*/10"
  └── 写内存: _memory_cache["patrol_cron"] = "*/10"

业务模块读配置:
  ConfigService.get("patrol_cron")
    ├── Step 1: _memory_cache["patrol_cron"]  → 命中(0.001ms) ✅
    ├── Step 2: redis.get("aiops:config:patrol_cron")  → 命中(1ms) 回填内存
    └── Step 3: SELECT config_value FROM ops_system_config WHERE config_key=... AND is_deleted=0  → 命中(10ms) 回填Redis+内存
```

---

## 二、文件结构

```
aiops/configuration/
├── model/
│   ├── ops_system_config.py    (159行)  ← ORM 模型 + ComponentTag(2个) + SystemConfigKey(13个) + DEFAULT_CONFIGS(13条)
│   └── init_database.sql        (57行)  ← 完整 DDL: 建表 + 迁移 + 13条默认数据 + 菜单
├── service/
│   ├── config_service.py       (348行)  ← ★ ConfigService 单例（get/set/query/reload/init）
│   ├── config_cache_service.py (156行)  ← ★ 三级缓存（内存 dict + Redis + MySQL 回源）
│   └── system_config_service.py (49行)  ← 旧接口兼容层（全部委托给 ConfigService）
├── api/
│   └── config_query_api.py      (32行)  ← ★ 跨模块 API（get_config / get_config_int / reload）
├── router/
│   └── system_config_router.py (153行)  ← REST API 7 个端点
└── schemas/
    └── system_config_schemas.py  (38行)  ← Pydantic 请求/响应
```

---

## 三、核心方法速查

### ConfigService（`config_service.py:23` — 单例）

| 方法 | 签名 | 行 | 说明 |
|------|------|-----|------|
| `init` | `async init(db)` | :38 | 启动初始化：迁移旧标签→写默认→加载缓存 |
| `get` | `async get(key, default="", db=None)→str` | :96 | 读字符串，三级缓存兜底 |
| `get_int` | `async get_int(key, default=0, db=None)→int` | :127 | 读整数 |
| `set_config` | `async set_config(db, key, value, ...)→dict` | :186 | 更新：MySQL+Redis+内存三段同步 |
| `query_by_key` | `async query_by_key(db, key)→dict` | :254 | 查单条完整记录 |
| `query_page` | `async query_page(db, page, limit, ...)→dict` | :262 | 分页查询，enabled.desc() 排序 |
| `get_all_tags` | `async get_all_tags(db)→list[str]` | :291 | 分类标签列表 |
| `reload_cache` | `async reload_cache(db)` | :302 | 强制刷新缓存 |

### 跨模块 API（`api/config_query_api.py` — 外部模块唯一入口）

```python
from aiops.configuration.api.config_query_api import get_config, get_config_int

cron = await get_config("patrol_cron")           # → "*/2"
timeout = await get_config_int("timeout", default=300)  # → 300
```

---

## 四、完整调用链路

### 4.1 启动链路

```
main.py:50  ConfigService.init(session)
  │
  ├── [1] _migrate_component_tags(db)             :70
  │      SELECT * FROM ops_system_config WHERE is_deleted=0
  │      "数据采集"/"服务巡检"/"数据库备份"/"数据库巡检" → "SCHEDULE"
  │      "通用" → "SYSTEM"
  │
  ├── [2] _init_default_configs(db)               :51
  │      遍历 13 条 DEFAULT_CONFIGS
  │      每条 SELECT WHERE config_key=? AND is_deleted=0
  │      不存在 → INSERT，存在 → 跳过（不覆盖用户修改）
  │
  └── [3] _load_all_from_db(db)                   :85
         SELECT * FROM ops_system_config WHERE is_deleted=0
         → cache_reload(configs)
           ├── _memory_cache = {k: v for all configs}
           └── Redis pipeline: SET aiops:config:{key} {value} × N
```

### 4.2 修改链路

```
前端 PUT /admin/system/config  {"config_key": "patrol_cron", "config_value": "*/10"}

system_config_router.py:97  config_update()
  → ConfigService.set_config(db, key, "*/10")      :186
    ├── SELECT WHERE config_key=? AND is_deleted=0
    │   有 → UPDATE，无 → INSERT
    │   db.flush()
    └── cache_set(key, "*/10")                     cache_service.py:124
        ├── _memory_cache[key] = "*/10"
        └── redis.set("aiops:config:{key}", "*/10")

下次任何业务读 patrol_cron → 内存命中 → "*/10" ✅
```

### 4.3 读链路

```
业务模块调用:
  await get_config("patrol_cron")

ConfigService.get("patrol_cron")                   :96
  ├── cache_get("patrol_cron")                     cache_service.py:107
  │   ├── _memory_cache["patrol_cron"]             ← 0.001ms
  │   │   有 → 返回 ✅
  │   └── redis.get("aiops:config:patrol_cron")    ← 1ms
  │        有 → 回填内存, 返回 ✅
  │        没有 → 返回 None
  │
  └── 缓存未命中 → _db_get(db, "patrol_cron")      :311
      SELECT config_value FROM ops_system_config
      WHERE config_key="patrol_cron" AND is_deleted=0
      → cache_set(key, value) 回填 → 返回 ✅
```

---

## 五、当前配置全览

### 5.1 定时调度（SCHEDULE — 5 条全局 Cron）

> **这些是全局配置**，所有服务器/数据库共用同一个 cron。不是每个库/每台服务器单独配 cron。
> 调度器逻辑：读全局 cron → match_cron → 遍历所有启用的策略/服务器 → 逐个执行。
> 具体的差异化控制（如某个库是否参与备份）由各模块自己的表控制（如 `ops_database_backup_policy.status`）。
> 设计决策详见 `module-backup-sync.md` 第五节。

| config_key | 默认值 | enabled | 调度器消费方 |
|-----------|--------|---------|------------|
| `patrol_cron` | `*/2` | 1 | `main.py` → 服务巡检 |
| `collector_cron` | `0 0 2 * * ?` | 0 | `collector_service.py` → 数据采集 |
| `db_backup_cron` | `0 0 2 * * ?` | 0 | `db_backup_scheduler.py` → 数据库备份 |
| `db_verify_cron` | `0 0 4 * * ?` | 0 | `db_backup_scheduler.py` → 备份校验 |
| `db_check_cron` | `0 0 2 * * ?` | 0 | `db_inspection_scheduler.py` → 数据库巡检 |

**前端 Cron 时间选择器**：配置中心编辑 `_cron` 类型配置时自动显示可视化生成器（每分钟/每N分钟/每天/每周/每月/自定义），无需手写表达式。

**Cron 解析引擎**：`aiops/util/cron_utils.py:62` — `match_cron()` 统一供所有调度器调用，支持 5-7 段格式和 `MON,WED` 等星期名称语法。

**所有调用方**（4 处，3 个文件）：

| 文件:行 | 调度器 | 配置来源 | 调用代码 |
|--------|--------|---------|---------|
| `collector_service.py:470` | 数据采集 | `collector_cron` | `if not match_cron(cron_expr, now): return` |
| `backup_scheduler.py:99` | 数据库备份 | `db_backup_cron` | `if not match_cron(backup_cron, now_minute): continue` |
| `backup_scheduler.py:191` | 备份校验 | `db_verify_cron` | `if not match_cron(verify_cron, now_minute): return` |
| `inspection_scheduler.py:52` | 数据库巡检 | `db_check_cron` | `if not match_cron(global_cron, now): return` |

> `patrol_cron` 不调 `match_cron()`——它的值直接作为 APScheduler 的 `minute` 参数（`*/2` → 每 2 分钟），由 APScheduler 内部做匹配。
> 其余 4 个调度器按 `minute="*"` 每分钟触发一次，在内部调 `match_cron()` 做二次匹配。

### 5.2 AI 大模型（AI — 3 条，★ 2026-08-05 新增）

> **设计原则**：只有"高频切换"的配置进配置中心（服务商、当前模型）；**api_key / base_url / temperature 等敏感或稳定配置留在 .env**（不进数据库，避免明文泄露）。

| config_key | 默认值 | enabled | 消费方 |
|-----------|--------|---------|--------|
| `llm.provider` | 取 .env `LLM_PROVIDER` | 1 | `llm_config.get_llm_config()` → LLMClient 热重建实例 |
| `llm.model` | 取 .env 对应服务商模型名 | 1 | 同上（配置中心切换后即时生效，无需重启） |
| `llm.model_sync_cron` | `0 0 2 * * ?` | 0 | `main.py` → 大模型列表定时同步（关闭时手动同步） |

**读取方式（★ 同步场景）**：`llm_config.get_llm_config()` 是同步方法，通过 `config_query_api.get_config_sync()`（内存缓存同步读，`config_cache_service._memory_get`）读取，缓存未命中兜底 .env。

**热切换机制**：`LLMClient.get_llm()` 每次调用对比配置中心最新 provider/model，变更即重建 LLM 实例（`[LLMClient] 模型配置变更，重建 LLM 实例` 日志），页面切换后立即生效。

**模型列表数据源**：`llm_model` 表（`aiops/ai/service/llm_model_service.py` 同步/查询）—— 手动按钮或定时任务调厂商接口（Ollama `/api/tags`、云厂商 `/v1/models`）解析 `model` + `owned_by` 写入；配置中心「当前模型」下拉读此表（allow-create 兜底）。

### 5.3 服务巡检告警规则（ALARM — 1 条 JSON，★ 2026-08-07 重构）

> ★ **统一规则源**：服务巡检（系统级 + 服务级）告警全部由 `alarm.rules`（JSON 数组）驱动，**替代 ops_patrol_rule 规则表**与 `alarm.cpu_threshold` 等独立阈值 key。规则引擎 `patrol_rule_service.evaluate_metric_rules()` 每次巡检读取，**即时生效**。

| config_key | 默认值 | 消费方 |
|-----------|--------|--------|
| `alarm.rules` | 14 条规则 JSON | `patrol_rule_service.py:evaluate_metric_rules` → 系统级/服务级告警 |

**规则字段**：`rule_name / metric_key / operator / threshold / level / type_name / template / continue_periods / enabled`

**支持指标**（metric_key）：`cpu / memory / disk / mem_available / disk_inode / swap_percent / load_per_core / net_estab / fd_usage / zombie_count / dmesg_error_count / is_running / conn_usage / slow_queries`

**★ 去抖（continue_periods）**：连续 N 个巡检周期超阈值才告警（Redis 计数），瞬时抖动不误报；指标恢复正常自动清零。

**★ 告警恢复**：本次巡检未触发的未处理告警 → 自动置为已恢复（status=1）+ 发送恢复通知（`alarm_service.recover_alarms`）。

### 5.4 通知场景（NOTIFICATION — 10 条）

格式规范见下节。

---

## 六、通知场景 JSON 配置详解

每个 `notification.scene.*` 的 `config_value` 是 JSON，控制该场景走哪些渠道。

**格式**：`{"email": true, "feishu": true, "wecom": false, "dingtalk": false}`

| key | 中文 | Channel 类 | is_enabled 条件 |
|-----|------|-----------|---------------|
| `email` | 邮件 | `EmailChannel` | `SMTP_USER` + `SMTP_PASSWORD` 都配置 |
| `feishu` | 飞书 | `FeishuChannel` | `FEISHU_ENABLED=true` + `FEISHU_URL` 不为空 |
| `wecom` | 企微 | `WorkWeixinChannel` | `WORK_WEIXIN_ENABLED=true` + `WEBHOOK_URL` 不为空 |
| `dingtalk` | 钉钉 | `DingtalkChannel` | `DINGTALK_ENABLED=true` + `WEBHOOK_URL` 不为空 |

**运行逻辑**（`channel_manager.py:broadcast`）：

```
1. 读 scene config → json.loads(raw)
2. 遍历已注册 channels:
   for channel in channels:
       if scene_config[channel.channel_name] is True:
           → 保留此 channel
       else:
           → 过滤掉
3. asyncio.gather(保留的 channels 并发发送)
```

**10 个场景默认值**：

| scene key | 默认 JSON | 适用 |
|----------|----------|------|
| `notification.scene.alarm` | `{"email":true,"feishu":true,"wecom":false,"dingtalk":false}` | 服务器告警 |
| `notification.scene.db_backup_failed` | `{"email":true,"feishu":true}` | 备份失败 |
| `notification.scene.db_sync_failed` | `{"email":true,"feishu":true}` | 同步失败 |
| `notification.scene.db_policy_change` | `{"email":true,"feishu":true}` | 策略变更 |
| `notification.scene.password_verification` | `{"email":true}` | 密码验证（仅邮件） |
| `notification.scene.patrol_analysis` | `{"email":true,"feishu":true}` | 巡检AI分析 |
| `notification.scene.database_assistant` | `{"email":true,"feishu":true}` | DB助手 |
| `notification.scene.db_inspection` | `{"email":true,"feishu":true}` | 数据库巡检 |
| `notification.scene.work_order` | `{"email":true,"feishu":true,"wecom":false,"dingtalk":false}` | 工单类通知统一渠道（创建/待审核/超时/审核不通过/完成 共用） |

---

## 七、数据库

```sql
CREATE TABLE ops_system_config (
    id            VARCHAR(64) PRIMARY KEY,
    config_key    VARCHAR(100) NOT NULL UNIQUE,
    config_value  TEXT NOT NULL,
    component_tag VARCHAR(50) NOT NULL,
    enabled       TINYINT(1) DEFAULT 0,
    description   VARCHAR(255) DEFAULT '',
    is_deleted    TINYINT(1) DEFAULT 0,        -- 软删除
    create_time   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_time   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 八、如何新增配置

### 新增一个 cron 配置

```python
# ① configuration/model/ops_system_config.py
class SystemConfigKey:
    NEW_CRON = "new_cron"

# ② 追加 DEFAULT_CONFIGS
{"config_key": "new_cron", "config_value": "0 0 3 * * ?",
 "component_tag": ComponentTag.SCHEDULE, "enabled": 0, "description": "新定时任务"}

# ③ init_database.sql 追加 INSERT IGNORE

# ④ 业务代码读取
from aiops.configuration.api.config_query_api import get_config
cron = await get_config("new_cron")
```

### 新增一个通知场景

```python
# ① base_channel.py 加枚举
class NotificationType(str, Enum):
    NEW_SCENE = "new_scene"

# ② ops_system_config.py 加默认值
{"config_key": "notification.scene.new_scene",
 "config_value": '{"email":true,"feishu":true}',
 "component_tag": "NOTIFICATION", "enabled": 1, "description": "新通知场景"}

# ③ dispatcher.py 加 dispatch 函数
async def dispatch_new_scene(...):
    await channel_manager.broadcast(NotificationType.NEW_SCENE, **kwargs)

# ④ 各 Channel 加 supported_types + handler
```

---

## 九、全部配置读取全景（读配置中心 vs .env）

| 分类 | 读配置中心（13条） | 读.env（55个变量） |
|------|------------------|-------------------|
| 定时调度 | patrol/collector/backup/verify/db_check cron | — |
| 通知渠道 | 8 个 notification.scene.* JSON | SMTP_*/FEISHU_*/DINGTALK_* (密钥+开关) |
| 数据库 | — | DB_HOST/PORT/USER/PASSWORD/NAME |
| Redis | — | REDIS_HOST/PORT/DB/PASSWORD |
| 登录安全 | — | SESSION_TTL/LOGIN_FAIL_*/MULTI_LOGIN |
| AI模型 | — | LLM_PROVIDER/OPENAI_*/DEEPSEEK_*/OLLAMA_* |
| 云存储 | — | OSS_*/COS_* |
| 密钥 | — | TOKEN_SIGN_KEY/FERNET_KEY |

> 详表：`README.md` → "配置管理" 章节

---

## 十、业务调用全景 — 每一个读取配置中心的代码片段

目前有 **6 个调用方** 从配置中心读取配置并用于业务判断。下面是每一处的完整代码、注释和运行逻辑。

### 10.1 main.py — 启动时注册 5 个调度器

**位置**：`main.py:87-106`

```python
# ========== 读取巡检 cron（字符串值） ==========
patrol_cron = PATROL_CRON_DEFAULT       # ← .env 兜底值 "*/5"
db_cron = await ConfigService.get(      # ← 配置中心读取
    SystemConfigKey.PATROL_CRON,        #   key = "patrol_cron"
    db=session
)
if db_cron:                              #  有值就覆盖兜底
    patrol_cron = db_cron               #   例: db_cron = "*/2"

# ========== 读取其余 4 个调度器 cron + 开关 ==========
for key, si_key in [
    (SystemConfigKey.COLLECTOR_CRON, "coll"),   # collector_cron
    (SystemConfigKey.DB_BACKUP_CRON, "bak"),    # db_backup_cron
    (SystemConfigKey.DB_VERIFY_CRON, "verify"), # db_verify_cron
    (SystemConfigKey.DB_CHECK_CRON, "chk"),     # db_check_cron
]:
    cfg = await ConfigService.query_by_key(session, key)
    # cfg = {"config_key": "db_backup_cron", "config_value": "0 0 2 * * ?", "enabled": 0, ...}

    si[f"{si_key}_enabled"] = cfg.get("enabled", 0) if cfg else 0
    # → 调度器开关: si["bak_enabled"] = 0 或 1

    si[f"{si_key}_cron"] = cfg.get("config_value", "?") if cfg else "?"
    # → cron 表达式: si["bak_cron"] = "0 0 2 * * ?" 或 "?"

# ========== 注册 APScheduler 定时任务 ==========
scheduler.add_job(run_patrol_inspection, "cron", minute=patrol_cron, ...)
# → patrol_cron = "*/2" → 每2分钟执行一次

# 其余 4 个注册 minute="*" 每分钟触发，在各自调度器内部 match_cron 做二次匹配
```

**运行逻辑**：启动时注册 10 个定时任务（含工单超时/模型同步/调度热同步），首次同步后按配置中心对齐 cron/enabled。

**★ 运行时热生效（2026-08-08 改造，不再需要重启）**：见 `aiops/util/scheduler_sync.py`——

```
配置中心保存/刷新（set_config / reload_cache）
  → _notify_change 回调 → SchedulerSync.sync_all(db)     ← ① 即时生效
60 秒守护任务 scheduler_config_sync → sync_all(db)        ← ② 兜底（SQL 直改等）

sync_all 比对 cron/enabled 变化：
  trigger 模式（巡检/分析/模型同步）：cron 变 → reschedule_job（暂停中也更新，恢复即新频率）
  internal 模式（采集/备份/校验/DB巡检）：只动 enabled（cron 由内部 match_cron 天然热生效）
  enabled 1↔0 → pause_job / resume_job（幂等，无变化零操作）
```

### 10.2 备份调度器 — 读全局开关 + cron 匹配

**位置**：`ops_database_backup_scheduler.py:68-72`

```python
async def run_scheduled_backups(db_factory):
    async with db_factory() as db:
        # ========== ① 读全局开关 ==========
        backup_config = await get_config_dict(db, SystemConfigKey.DB_BACKUP_CRON)
        # backup_config = {"config_key": "db_backup_cron", "config_value": "0 58 22 * * ?", "enabled": 0}

        if backup_config is None or not backup_config.get("enabled"):
            return  # ← enabled=0 或不存在 → 直接退出，不执行备份

        # ========== ② 读全局 cron 并匹配当前时间 ==========
        backup_cron = backup_config.get("config_value", "0 0 2 * * ?")
        # backup_cron = "0 58 22 * * ?" → 每天 22:58 执行

        # ========== ③ 遍历所有启用的策略 ==========
        for policy in policies:
            if not match_cron(backup_cron, now_minute):
                continue  # ← cron 不匹配当前分钟 → 跳过这个策略

            execute_backup_now(db, policy.database_id)
```

**运行逻辑**：三层检查。① `enabled=0` → 全局备份关闭，所有库都不备份。② `match_cron` 不匹配 → 这个分钟不该执行。③ 遍历所有 `status=1` 的策略，逐个执行备份。

**同样模式**出现在：
- `ops_database_backup_scheduler.py:168` — 读 `db_verify_cron`（备份校验调度器）
- `ops_database_inspection_scheduler.py:48` — 读 `db_check_cron`（数据库巡检调度器）
- `collector_service.py:428` — 读 `collector_cron`（数据采集调度器）

```python
# 校验调度器 (scheduler.py:168)
verify_config = await get_config_dict(db, SystemConfigKey.DB_VERIFY_CRON)
if verify_config is None or not verify_config.get("enabled"):
    return
verify_cron = verify_config.get("config_value", "0 0 4 * * ?")
if not match_cron(verify_cron, now_minute):
    return
# → 遍历 enable_verify=1 的策略，逐个校验

# 巡检调度器 (inspection_scheduler.py:48)
check_config = await get_config_dict(db, SystemConfigKey.DB_CHECK_CRON)
if check_config is None or not check_config.get("enabled"):
    return
global_cron = check_config.get("config_value", _DEFAULT_DB_CHECK_CRON)
if not match_cron(global_cron, now):
    return
# → 查询启用巡检的数据库列表 → 逐个执行

# 采集调度器 (collector_service.py:428)
config = await get_config_dict(db, SystemConfigKey.COLLECTOR_CRON)
# → { "enabled": 0, "cron_expression": "0 0 2 * * ?" }
return {"enabled": config.get("enabled", 0), "cron_expression": config.get("config_value")}
# ↑ 调用方拿到后做 enabled 判断 + match_cron
```

### 10.3 通知场景 — 读 JSON 配置过滤通知渠道

**位置**：`channel_manager.py:115-138` — `_apply_scene_config()`

```python
async def _apply_scene_config(self, notification_type, channels):
    # ========== ① 拼接场景 key ==========
    scene_key = f"notification.scene.{notification_type.value}"
    # 例: notification_type = NotificationType.ALARM
    #     notification_type.value = "alarm"
    #     scene_key = "notification.scene.alarm"

    # ========== ② 从配置中心读 JSON 字符串 ==========
    raw = await get_config(scene_key)
    # 例: raw = '{"email": true, "feishu": true, "wecom": false, "dingtalk": false}'

    if not raw:
        # 场景配置不存在 → 不发送（保守策略）
        raise ValueError(f"场景配置不存在: {scene_key}")

    # ========== ③ 解析 JSON ==========
    scene_config = json.loads(raw)
    # → {"email": True, "feishu": True, "wecom": False, "dingtalk": False}

    # ========== ④ 按配置过滤渠道 ==========
    filtered = [
        c for c in channels
        if scene_config.get(c.channel_name, False) is True
    ]
    # EmailChannel.channel_name = "email"   → scene_config["email"]   = True → 保留
    # FeishuChannel.channel_name = "feishu" → scene_config["feishu"]  = True → 保留
    # DingtalkChannel  → 未注册（DINGTALK_ENABLED=false）→ 不在 channels 里
    # = 最终: [EmailChannel, FeishuChannel]

    return filtered
```

**完整广播流程**（`channel_manager.py:49-95`）：

```python
async def broadcast(self, notification_type, **kwargs):
    # 第一步：代码层过滤（只保留支持该类型 + 已启用的 Channel）
    channels = self.get_enabled_channels(notification_type)

    # 第二步：配置层过滤（读 notification.scene.* JSON，过滤掉 false 的渠道）
    channels = await self._apply_scene_config(notification_type, channels)

    # 第三步：并发发送到过滤后的渠道
    await asyncio.gather(*[
        channel.send(notification_type, **kwargs)
        for channel in channels
    ])
```

### 10.4 旧兼容层调用（collector_service.py 等）

有少量代码通过旧兼容层 `system_config_service.py` 读取，内部委托给 `ConfigService`：

```python
# collector_service.py:425
from aiops.configuration.service.system_config_service import get_config_dict

config = await get_config_dict(db, SystemConfigKey.COLLECTOR_CRON)
# ↓ 实际上走了:
# get_config_dict → ConfigService.query_by_key → SELECT ... WHERE config_key=? AND is_deleted=0
# → {"config_key": "collector_cron", "config_value": "0 0 2 * * ?", "enabled": 0, ...}
```

---

## 十一、调用方总览

| 调用方 | 文件:行 | 读什么 | 值的类型 | 业务用途 |
|-------|--------|--------|---------|---------|
| `main.py` | :92 | `patrol_cron` | 字符串 | APScheduler minute 参数 |
| `main.py` | :102 | `collector/backup/verify/check_cron` | 完整行 dict | 日志输出开关+cron |
| `backup_scheduler.py` | :69 | `db_backup_cron` | 完整行 dict | 全局是否启用 + match_cron |
| `backup_scheduler.py` | :168 | `db_verify_cron` | 完整行 dict | 同上（校验） |
| `inspection_scheduler.py` | :48 | `db_check_cron` | 完整行 dict | 同上（巡检） |
| `collector_service.py` | :428 | `collector_cron` | 完整行 dict | 同上（采集） |
| `channel_manager.py` | :121 | `notification.scene.*` | JSON 字符串 | `json.loads()` 后按 bool 过滤渠道 |

**value 用法的两种模式**：

| value 类型 | 读取方法 | 业务处理 |
|-----------|---------|---------|
| 纯字符串（如 `*/2`） | `ConfigService.get()` → `str` | 直接赋给 APScheduler minute 参数 |
| 整行 dict（含 `enabled` + `config_value`） | `ConfigService.query_by_key()` → `dict` | 先判断 `enabled`，再取 `config_value` 做 `match_cron` |
| JSON 字符串 | `ConfigService.get()` → `str` → `json.loads()` | 按 channel_name 查 bool，过滤渠道列表 |
