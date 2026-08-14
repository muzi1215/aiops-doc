# 消息通知模块文档（Notification）

> **代码行数**: 2314 | **文件数**: 27 | **最后更新**: 2026-08-02

---

## 一、全景架构图

```
业务模块（谁需要发通知）
  │
  │  dispatcher.dispatch_alarm(...)           ← 8 个 dispatch_xxx 函数
  │  dispatcher.dispatch_backup_failed(...)     业务模块只调这一个入口
  │  dispatcher.dispatch_auth_verification(...)
  │  ...
  ▼
dispatcher.py（通知调度器）
  │
  │  _ensure_channels_initialized()           ← 首次调用时注册全部 Channel
  │  channel_manager.broadcast(NOTIFICATION_TYPE, **kwargs)
  ▼
channel_manager.py（通道管理器 — 单例）
  │
  │  Step 1: get_enabled_channels(type)       ← 代码层过滤：谁支持这个类型 + 谁启用了
  │  Step 2: _apply_scene_config(type)        ← 配置层过滤：读 notification.scene.* JSON
  │  Step 3: asyncio.gather(各channel并发发送) ← 并发广播，异常隔离
  ▼
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ EmailChannel │FeishuChannel │DingtalkCh.   │WorkWeixinCh. │
│ (email)      │ (feishu)     │ (dingtalk)   │ (wecom)      │
│              │              │              │              │
│ SMTP SSL →   │ httpx POST → │ Webhook POST │ Webhook POST │
│ QQ邮箱       │ 飞书群机器人  │ 钉钉群机器人  │ 企微群机器人  │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 二、完整调用链（从告警产生到飞书/邮件收到消息）

### 2.1 Step 0：服务启动后首次 dispatch 调用

```python
# dispatcher.py:17  _ensure_channels_initialized()
# 这段代码在【首次 dispatch 调用时】执行一次，之后不再执行

async def _ensure_channels_initialized():
    if channel_manager.channel_names:   # ← 已注册过，跳过
        return

    # 逐个实例化并注册 Channel
    channel_manager.register(EmailChannel())         # ①
    channel_manager.register(FeishuChannel())        # ②
    channel_manager.register(DingtalkChannel())      # ③
    channel_manager.register(WorkWeixinChannel())    # ④

# 每个 Channel 注册时：
#   channel_manager.register(channel)
#     → channel.is_enabled() 为 True 才加入 _channels 列表
#     → is_enabled() 为 False 则跳过（日志: "通道 xxx 未启用，跳过注册"）
```

### 2.2 Step 1：业务模块发起通知

```python
# alarm_service.py:385  create_alarm() 方法内
await dispatch_alarm(
    db=db,
    server_hostname="lx-aliyum-server",
    server_ip="47.103.12.12",
    alarm_type="系统资源",
    alarm_level="高危",
    alarm_content="CPU 使用率 95%，超过阈值 80%",
    server_id="504866",
)
```

### 2.3 Step 2：dispatcher 转发到 channel_manager

```python
# dispatcher.py:41  dispatch_alarm()
async def dispatch_alarm(db, server_hostname, server_ip, ...):
    await _ensure_channels_initialized()            # 首次调用注册全部 Channel
    await channel_manager.broadcast(                # 广播到所有支持的 Channel
        NotificationType.ALARM,                     # ← 通知类型枚举
        db=db,
        server_hostname=server_hostname,
        server_ip=server_ip,
        ...
    )
```

### 2.4 Step 3：channel_manager 代码层过滤

```python
# channel_manager.py:49  broadcast()

# ======== 第一步：代码层过滤 ========
channels = self.get_enabled_channels(NotificationType.ALARM)
#   → 遍历 _channels 列表（已注册的全部 Channel）
#   → 逐个检查：
#       1. channel.supports(ALARM) → 该 Channel 的 supported_types 是否包含 ALARM
#       2. channel.is_enabled()    → 该 Channel 的 is_enabled() 是否返回 True
#   → 两个条件都满足 → 加入候选列表

# 当前注册情况（假设 SMTP 和 FEISHU_URL 都配置了）：
#   EmailChannel:
#     supported_types 包含 ALARM ✅
#     is_enabled() → SMTP_USER 和 SMTP_PASSWORD 都配置了 → True ✅
#     → 加入候选
#   FeishuChannel:
#     supported_types 包含 ALARM ✅
#     is_enabled() → FEISHU_ENABLED=true + FEISHU_URL 配置了 → True ✅
#     → 加入候选
#   DingtalkChannel:
#     is_enabled() → DINGTALK_ENABLED=false → False ❌
#     → 跳过（注册时就没加入 _channels）
#   WorkWeixinChannel:
#     is_enabled() → WORK_WEIXIN_ENABLED=false → False ❌
#     → 跳过

# 候选 channels = [EmailChannel, FeishuChannel]
```

### 2.5 Step 4：channel_manager 配置层过滤

```python
# channel_manager.py:102  _apply_scene_config()

# ======== 第二步：读配置中心场景配置 ========
scene_key = f"notification.scene.alarm"    # ← 按 NotificationType.ALARM.value 拼接

# 从配置中心读取
raw = await get_config("notification.scene.alarm")
# → 数据库返回值: '{"email": true, "feishu": true, "wecom": false, "dingtalk": false}'

scene_config = json.loads(raw)
# → {"email": True, "feishu": True, "wecom": False, "dingtalk": False}

# 按配置过滤：只保留 scene_config 中 enabled=true 的 channel
filtered = [c for c in channels if scene_config.get(c.channel_name, False) is True]
#   EmailChannel.channel_name = "email"  → scene_config["email"]  = True  → 保留 ✅
#   FeishuChannel.channel_name = "feishu" → scene_config["feishu"] = True → 保留 ✅

# 最终发送渠道 = [EmailChannel, FeishuChannel]
```

**如果管理员在配置中心把 `notification.scene.alarm` 改为 `{"email": false, "feishu": true}`**：

```
scene_config = {"email": False, "feishu": True}
filtered:
  "email" → False → 过滤掉 ❌
  "feishu" → True → 保留 ✅
→ 最终只有 [FeishuChannel]，邮件不发送
```

### 2.6 Step 5：并发发送

```python
# channel_manager.py:86  broadcast() 第三步

# ======== 第三步：asyncio.gather 并发发送 ========
async def _send(channel):
    try:
        success = await channel.send(NotificationType.ALARM, **kwargs)
        # 每个 Channel 的 send() 方法内部根据通知类型找到对应的 handler
        results[channel.channel_name] = success
    except Exception:
        results[channel.channel_name] = False
        # 不抛异常，不影响其他 Channel

await asyncio.gather(*[_send(c) for c in channels])
# → EmailChannel.send() 和 FeishuChannel.send() 同时执行
```

### 2.7 Step 6：EmailChannel 内部处理

```python
# email_channel.py:60  EmailChannel.send()
async def send(self, notification_type, **kwargs):
    handler = self._get_handler(notification_type)
    # → 查 handlers 字典: NotificationType.ALARM → self._send_alarm
    return await handler(**kwargs)

# email_channel.py:86  _send_alarm()
async def _send_alarm(self, **kwargs):
    from aiops.notification.email.email_alarm_send import send_alarm_email
    db = kwargs.get("db")
    result = await send_alarm_email(
        db=db,
        server_hostname=kwargs.get("server_hostname"),
        server_ip=kwargs.get("server_ip"),
        alarm_type=kwargs.get("alarm_type"),
        alarm_level=kwargs.get("alarm_level"),
        alarm_content=kwargs.get("alarm_content"),
        server_id=kwargs.get("server_id"),
    )
    return result.get("success", False)

# email_alarm_send.py:send_alarm_email()
#   → 查 sys_user 表获取超级管理员邮箱
#   → 构建 HTML 告警邮件模板
#   → email_common_send.send_html_email(to, subject, html_body)
#     → smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT)
#     → server.login(SMTP_USER, SMTP_PASSWORD)
#     → server.sendmail(from, to, msg.as_string())
```

### 2.8 Step 7：FeishuChannel 内部处理

```python
# feishu_channel.py:60  FeishuChannel.send()
async def send(self, notification_type, **kwargs):
    builder = self._get_builder(notification_type)
    # → 查 builders 字典: NotificationType.ALARM → self._build_alarm
    payload = builder(**kwargs)             # 构建飞书消息体
    result = await send_feishu_post(payload) # 发送 HTTP POST
    return result.get("StatusCode") == 0

# feishu_channel.py:89  _build_alarm()
@staticmethod
def _build_alarm(**kwargs):
    return build_alarm_post(
        server_hostname=kwargs.get("server_hostname"),
        server_ip=kwargs.get("server_ip"),
        alarm_type=kwargs.get("alarm_type"),
        alarm_level=kwargs.get("alarm_level"),
        alarm_content=kwargs.get("alarm_content"),
    )

# feishu_util.py:84  build_alarm_post()
#   → 构建飞书 post 富文本消息:
#     {
#       "msg_type": "post",
#       "content": {
#         "post": {
#           "zh_cn": {
#             "title": "🚨 AIops 服务告警",
#             "content": [
#               [{"tag": "text", "text": "服务器：lx-aliyum-server\n"}],
#               [{"tag": "text", "text": "告警级别：高危\n"}],
#               ...
#             ]
#           }
#         }
#       }
#     }

# feishu_send.py:16  send_feishu_post()
#   → url, timestamp, sign = gen_sign_with_timestamp()  ← 签名校验
#   → httpx.AsyncClient.post(url, json=payload)          ← HTTP POST 到飞书 Webhook
#   → 返回 {"StatusCode": 0, "StatusMessage": "success"}
```

---

## 三、通知类型 × 渠道完整矩阵

| 枚举名 | scene key | 邮件 | 飞书 | 钉钉 | 企微 |
|-------|----------|------|------|------|------|
| `ALARM` | `notification.scene.alarm` | ✅ | ✅ | ❌ | ❌ |
| `DB_BACKUP_FAILED` | `notification.scene.db_backup_failed` | ✅ | ✅ | ❌ | ❌ |
| `DB_SYNC_FAILED` | `notification.scene.db_sync_failed` | ✅ | ✅ | ❌ | ❌ |
| `DB_POLICY_CHANGE` | `notification.scene.db_policy_change` | ✅ | ✅ | ❌ | ❌ |
| `PASSWORD_VERIFICATION` | `notification.scene.password_verification` | ✅ | ❌ | ❌ | ❌ |
| `PATROL_ANALYSIS` | `notification.scene.patrol_analysis` | ✅ | ✅ | ❌ | ❌ |
| `DATABASE_ASSISTANT` | `notification.scene.database_assistant` | ✅ | ✅ | ❌ | ❌ |
| `DB_INSPECTION` | `notification.scene.db_inspection` | ✅ | ✅ | ❌ | ❌ |

---

## 四、如何新增钉钉 Channel（完整步骤）

当前钉钉 Channel 的骨架已存在但 `supported_types` 返回空集。按以下步骤接入：

### 步骤 1：实现 supported_types

```python
# channels/dingtalk_channel.py

class DingtalkChannel(BaseChannel):
    channel_name = "dingtalk"

    @property
    def supported_types(self) -> set[NotificationType]:
        # ★ 在这里决定钉钉支持哪些通知类型
        return {
            NotificationType.ALARM,              # 告警 → 钉钉
            NotificationType.DB_BACKUP_FAILED,   # 备份失败 → 钉钉
            # PASSWORD_VERIFICATION 不加入 ← 验证码永远不发群聊
        }

    def is_enabled(self) -> bool:
        # 环境变量 DINGTALK_ENABLED=true 且 DINGTALK_WEBHOOK_URL 不为空时启用
        enabled = os.getenv("DINGTALK_ENABLED", "false").lower()
        if enabled in ("false", "0", "no"):
            return False
        return bool(os.getenv("DINGTALK_WEBHOOK_URL"))
```

### 步骤 2：实现 send() 方法

```python
    async def send(self, notification_type, **kwargs):
        builder = self._get_builder(notification_type)
        if not builder:
            return False
        try:
            payload = builder(**kwargs)
            webhook_url = os.getenv("DINGTALK_WEBHOOK_URL")
            result = await send_dingtalk_post(webhook_url, payload)
            return result.get("errcode") == 0
        except Exception:
            log.exception(f"[钉钉通道] 发送 {notification_type.value} 异常")
            return False

    def _get_builder(self, notification_type):
        # 每个通知类型 → 对应的消息构建函数
        return {
            NotificationType.ALARM: self._build_alarm,
            NotificationType.DB_BACKUP_FAILED: self._build_backup,
            # ... 其他类型
        }.get(notification_type)
```

### 步骤 3：实现消息构建函数

```python
    @staticmethod
    def _build_alarm(**kwargs):
        # 钉钉 Markdown 消息格式
        return {
            "msgtype": "markdown",
            "markdown": {
                "title": f"🚨 AIops 告警: {kwargs.get('server_hostname')}",
                "text": f"## AIops 服务告警\n\n"
                        f"- 服务器: {kwargs.get('server_hostname')}\n"
                        f"- IP: {kwargs.get('server_ip')}\n"
                        f"- 级别: {kwargs.get('alarm_level')}\n"
                        f"- 内容: {kwargs.get('alarm_content')}\n"
            }
        }
```

### 步骤 4：实现 HTTP 发送

```python
# dingtalk/dingtalk_send.py
async def send_dingtalk_post(webhook_url: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(webhook_url, json=payload)
        return resp.json()
```

### 步骤 5：配置中心默认值更新

```sql
-- notification.scene.alarm 的 JSON 值加了 dingtalk
UPDATE ops_system_config SET config_value = '{"email":true,"feishu":true,"wecom":false,"dingtalk":true}'
WHERE config_key = 'notification.scene.alarm';
```

### 步骤 6：.env 配置

```env
DINGTALK_ENABLED=true
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
```

**不需要改的文件**：`dispatcher.py`、`channel_manager.py`、`base_channel.py`——这三个是框架层，新增 Channel 只需实现 `BaseChannel` 子类并注册即可，零侵入。

---

## 五、三层防线

```
第一层 — 配置层: notification.scene.* JSON
  管理员在配置中心修改，即时生效，控制"要不要发"
  例如: {"email": false, "feishu": true} → 只飞书不发邮件

第二层 — 代码层: channel.supported_types
  FeishuChannel 不包含 PASSWORD_VERIFICATION
  即使配置写了 {"feishu": true}，get_enabled_channels() 也不返回 feishu

第三层 — 异常层: 配置不存在或解析失败
  → 跳过发送，日志告警
  → 不退化为全渠道发送
```

---

## 六、关键文件速查

| 文件 | 改动触发 |
|------|---------|
| `dispatcher.py` | 新增通知类型时：加 `dispatch_xxx()` 函数 |
| `channel_manager.py` | 不需要改（框架层） |
| `base_channel.py` | 新增通知类型时：加 `NotificationType` 枚举值 |
| `channels/email_channel.py` | 新增通知类型时：加 `_send_xxx()` + `supported_types` |
| `channels/feishu_channel.py` | 新增通知类型时：加 `_build_xxx()` + `supported_types` |
| `email/email_dbcenter_send.py` | 新增通知类型时：加邮件模板函数（通知模块内部，非跨模块 API） |
| `feishu/feishu_util.py` | 新增通知类型时：加飞书消息构建函数 |
| `configuration/api/config_query_api.py` | 新增通知场景时：加 `notification.scene.*` 默认配置 |


## 七、通知模块如何读取配置中心

**入口**：`channel_manager.py:118` — `_apply_scene_config()` 方法

```python
# channel_manager.py:115-144  _apply_scene_config()

# ① 根据通知类型拼接 scene key
scene_key = f"notification.scene.{notification_type.value}"
# ALARM → "notification.scene.alarm"
# DB_BACKUP_FAILED → "notification.scene.db_backup_failed"

# ② 通过 configuration api/ 子包读取配置中心
from aiops.configuration.api.config_query_api import get_config
raw = await get_config(scene_key)
# → get_config("notification.scene.alarm")
# → ConfigService.get() → 内存缓存(0.001ms) → Redis(1ms) → MySQL(10ms)
# → 返回值: '{"email": true, "feishu": true, "wecom": false, "dingtalk": false}'

# ③ 解析 JSON
scene_config = json.loads(raw)
# → {"email": True, "feishu": True, "wecom": False, "dingtalk": False}

# ④ 按配置过滤渠道
filtered = [c for c in channels
            if scene_config.get(c.channel_name, False) is True]
# EmailChannel.channel_name = "email"   → scene_config["email"]   = True  → 保留 ✅
# FeishuChannel.channel_name = "feishu" → scene_config["feishu"]  = True  → 保留 ✅
```

**调用链路全景**：

```
业务模块 dispatcher.dispatch_alarm()
  → channel_manager.broadcast(ALARM)
    → _apply_scene_config(ALARM)
      → from aiops.configuration.api.config_query_api import get_config  ← 通过 api/ 子包
        → ConfigService.get("notification.scene.alarm")
          → 内存缓存 _memory_cache["notification.scene.alarm"]
            → Redis aiops:config:notification.scene.alarm
              → MySQL ops_system_config WHERE config_key='notification.scene.alarm' AND is_deleted=0
      → json.loads(raw)
      → 按 channel_name 过滤
    → asyncio.gather(filtered_channels 并发发送)
```

**管理员修改渠道配置后**：前端配置中心改 JSON → 写 MySQL + Redis + 内存 → 下次 `broadcast()` 调用时读取新配置 → **即时生效，无需重启**。


---

## 八、邮件 vs 飞书推送的架构区别

### 8.1 为什么它们用不同的文件结构

```
EmailChannel                          FeishuChannel
   │                                     │
   │ send(ALARM, **kwargs)               │ send(ALARM, **kwargs)
   ▼                                     ▼
email/email_alarm_send.py          feishu/feishu_util.py          ← ① 消息构建
   │ build HTML + 查收件人               │ build Post JSON
   ▼                                     ▼
email/email_common_send.py         feishu/feishu_send.py          ← ② 发送底层
   │ smtplib.SMTP_SSL                  │ httpx.AsyncClient.post
   ▼                                     ▼
QQ邮箱 SMTP 服务器                   飞书 Webhook URL
```

**根本区别**：

| 维度 | 邮件 | 飞书 |
|------|------|------|
| **协议** | SMTP SSL（需密码登录） | HTTPS POST（Webhook URL + 签名） |
| **收件人** | 需要查数据库获取邮箱地址 | 不需要——Webhook URL 自带群绑定 |
| **消息格式** | HTML（`<table>`、`<div>` 等） | Post 富文本（`{"tag":"text","text":"..."}`） |
| **文件拆分原因** | 每种通知的 HTML 模板不同 → 每个模板一个文件 | 每种通知的 Post content 结构不同 → 每个构建函数一个函数 |
| **底层发送** | 共用一个 `send_html_email()` | 共用一个 `send_feishu_post()` |

### 8.2 邮件：为什么每种通知一个文件

邮件需要 **HTML 模板**，8 种通知的模板差异巨大——告警是红框表格、验证码是大号数字居中、AI报告整个是 Markdown 转 HTML。不适合写在一个文件里。

```
email/
├── email_common_send.py       ← 底层：SMTP 连接 + sendmail（所有邮件共用一个函数）
├── email_alarm_send.py        ← 告警邮件：红色告警表格模板
├── email_dbcenter_send.py     ← 备份/同步/策略变更/验证码 4 种业务邮件模板
├── email_analysis_send.py     ← AI 分析报告：Markdown → HTML
└── email_database_send.py     ← DB 助手问答邮件
```

**调用关系**（以内联 import 方式）：
```python
# email_channel.py:86  _send_alarm()
async def _send_alarm(self, **kwargs):
    from aiops.notification.email.email_alarm_send import send_alarm_email  # ← 延迟导入
    result = await send_alarm_email(db=db, server_hostname=..., alarm_content=...)
    # ↑ send_alarm_email 内部先调用 query_server_leader_id 查收件人
    #   再构建 HTML 模板，最后调 email_common_send.send_html_email 发出去
```

### 8.3 飞书：为什么所有构建函数在一个文件

飞书消息格式是固定的 Post JSON 结构，所有 8 种通知都是同一个模板框架：

```python
# feishu_util.py  — 所有构建函数集中管理

def build_alarm_post(...) → {"msg_type":"post", "content":{...}}
def build_backup_alert_post(...)  
def build_policy_change_post(...)
# ... 8 个函数

# 共用底层发送
async def send_feishu_post(payload) → httpx.AsyncClient.post(webhook_url, json=payload)
```

飞书不需要查收件人（Webhook URL 自带群绑定），不需要 HTML 模板，消息构建只需要拼 JSON。所以 8 个函数放在一个文件就够了。

### 8.4 如何新增一个渠道的消息构建

**邮件新增通知模板**：
1. 在 `email/` 下新建或修改对应的模板文件
2. 在 `email_channel.py` 加 `_send_xxx()` → 调模板函数
3. 在 `supported_types` 加枚举

**飞书新增通知类型**：
1. 在 `feishu/feishu_util.py` 加 `build_xxx_post()` 函数
2. 在 `feishu_channel.py` 加 `_build_xxx()` → 调构建函数
3. 在 `supported_types` 加枚举

**钉钉/企微**：同样模式——新建 `dingtalk/dingtalk_util.py` + `dingtalk_send.py`，在 `dingtalk_channel.py` 实现。
