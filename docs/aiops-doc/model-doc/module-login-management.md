# AIops — 登录管理体系模块

> 版本：v1.0 | 更新时间：2026-07-28 | 作者：lx
>
> **登录管理体系是基于 auth 认证模块增强的企业级登录安全管理方案**。在原有 JWT 认证基础上，引入 Redis Session、在线用户管理、递增降级锁定、封禁/黑名单管理、多端登录控制等能力。

---

# 一、需求分析

## 1.1 业务背景

原有系统采用纯无状态 JWT 认证，存在以下短板：

- **无法主动失效**：Token 一旦签发 7 天内有效，无法从服务端强制踢下线
- **无法在线管理**：不知道当前哪些用户在线、何时登录、使用什么设备
- **无法暴力防护**：无登录失败次数限制，存在暴力破解风险
- **无法封禁管理**：无黑名单/封禁功能，无法对违规账号进行处置
- **无法审计追踪**：登录日志不够详细，无法按设备/IP/耗时进行安全审计

## 1.2 功能需求清单

| 需求编号 | 功能 | 说明 |
|----------|------|------|
| LM-01 | Redis 登录 Session | 登录成功后缓存 Session 至 Redis（TTL 12 小时，可配） |
| LM-02 | 双重鉴权 | JWT 解析 + Redis Session 存在性校验，任一失败返回 401 |
| LM-03 | 退出登录 | 删除 Redis Session，下次请求自动 401 |
| LM-04 | 在线用户管理 | 扫描 Redis `login:user:*` 获取所有在线用户 |
| LM-05 | 强制踢下线 | 单用户 / 批量删除 Redis Session |
| LM-06 | 递增降级锁定 | 5 失败→锁 5 分钟(3 次)→锁 15 分钟(2 次)→锁 30 分钟(2 次)→锁 1 天(2 次) |
| LM-07 | 自动解封 | 到期自动恢复登录权限，保留对应级别尝试次数 |
| LM-08 | 封禁管理 | 单用户封禁 / 批量封禁，支持永久或指定时间 |
| LM-09 | 解封管理 | 单用户解封，恢复正常状态 |
| LM-10 | 锁定/解锁 | 管理员手动锁定/解锁用户 |
| LM-11 | 账号状态管理 | 4 种状态：正常/停用/封禁/锁定 |
| LM-12 | 登录日志增强 | 记录登录耗时(ms)、封锁/解封信息、失败原因 |
| LM-13 | 多端登录控制 | 环境变量控制允许/禁止同账号多端同时登录 |
| LM-14 | 前端友好提示 | 401 → "登录已过期"，封禁 → "已被封禁，解封时间: xxx"，锁定 → "已被锁定，xxx分钟后重试" |

---

# 二、系统设计

## 2.1 整体架构

```
                  用户登录 (POST /login)
                       │
         ┌─────────────┼─────────────┐
         │              │              │
    账号不存在      正常账号        已锁定/封禁
         │              │              │
         ▼              ▼              ▼
  返回"账号不存在"   JWT + Redis   返回具体原因
                      Session        + 解封时间
                       │
         ┌─────────────┼─────────────┐
         │              │              │
    密码正确        密码错误       达到阈值
         │              │              │
         ▼              ▼              ▼
  创建 Redis      递增失败计数    锁定 + 封禁
  Session          返回剩余次数    Redis 记录级别
         │                            + TTL
         ▼
  返回 Token + 权限

  ══════════════════════════════════════

  每次请求 (auth_deps.py)
       │
  JWT 解析 userId
       │
  Redis 查询 login:user:{userId}
       │
  ┌────┴────┐
  存在       不存在
   │          │
   ▼          ▼
  放行      401 "登录已过期"
```

## 2.2 Redis 存储结构

### Session 存储

```
Key:   login:user:{userId}
Type:  String (JSON)
TTL:   SESSION_TTL_HOURS * 3600 (默认 12 小时)

Value:
{
  "user_id": "10001",
  "username": "admin",
  "nickname": "管理员",
  "login_time": "2026-07-28 10:00:00",
  "expire_time": "2026-07-28 22:00:00",
  "ip": "192.168.1.100",
  "device": "Mac Chrome",
  "browser": "Chrome",
  "os": "macOS",
  "roles": ["admin"],
  "buttons": ["bnt.sysUser.add", ...],
  "routers": [...]
}
```

### 锁定状态存储

```
Key:   login:lock:{username}
Type:  String (JSON)

Value:
{
  "level": 2,                       # 当前降级级别 (1~4)
  "locked_until": null,             # 锁定到期时间（ISO格式），null=未锁定
  "attempts_remaining": 2,          # 当前级别剩余尝试次数
  "fail_count": 1                   # 当前级别已失败次数
}
```

## 2.3 递增降级策略

| 级别 | 触发失败数 | 锁定时间 | 解锁后可用次数 |
|------|-----------|---------|---------------|
| 1 | 5 次 | 5 分钟 | 3 次 |
| 2 | 3 次 | 15 分钟 | 2 次 |
| 3 | 2 次 | 30 分钟 | 2 次 |
| 4 | 2 次 | 1 天 | 2 次 |

- 锁定到期**自动解封**，不清除级别（下次触发直接进入当前级别）
- 登录成功**清除全部锁定状态**，级别归零
- 级别最高为 4 级，达到后循环在 4 级

## 2.4 数据库设计

### sys_user 新增字段（ALTER TABLE）

```sql
ALTER TABLE sys_user
    ADD COLUMN ban_reason VARCHAR(255) DEFAULT NULL COMMENT '封禁原因',
    ADD COLUMN ban_start_time TIMESTAMP NULL DEFAULT NULL COMMENT '封禁开始时间',
    ADD COLUMN ban_end_time TIMESTAMP NULL DEFAULT NULL COMMENT '封禁结束时间（NULL=永久封禁）';
```

### sys_login_log 新增字段

```sql
ALTER TABLE sys_login_log
    ADD COLUMN login_duration_ms INT DEFAULT 0 COMMENT '登录耗时(毫秒)';
```

### 账号状态枚举（sys_user.status）

| 值 | 含义 | 说明 |
|----|------|------|
| 0 | 停用 | 管理员手动停用 |
| 1 | 正常 | 可以登录 |
| 2 | 封禁 | 管理员封禁，ban_end_time 到期自动解封 |
| 3 | 锁定 | 登录失败自动锁定 / 管理员手动锁定 |

---

# 三、核心实现

## 3.1 目录结构

```
aiops/
├── config/
│   └── redis_config.py              # Redis 连接池 + 登录相关常量
│
├── auth/
│   ├── model/
│   │   ├── sys_user.py              # 新增 ban_reason/ban_start_time/ban_end_time
│   │   └── sys_login_log.py         # 新增 login_duration_ms
│   │
│   ├── routes/
│   │   ├── login.py                 # 登录：Redis Session + 递增锁定 + 封禁检查
│   │   ├── auth_deps.py             # 鉴权：JWT + Redis Session 双重校验
│   │   ├── online_user.py           # ★ 在线用户管理（新增）
│   │   └── sys_user.py              # 新增 ban/unban/lock/unlock/batchBan 接口
│   │
│   ├── schemas/
│   │   ├── sys_user.py              # 新增 BanParam/UnbanParam/BatchBanParam
│   │   ├── online_user.py           # ★ 在线用户 Schema（新增）
│   │   └── sys_login_log.py         # 新增 login_duration_ms
│   │
│   └── service/
│       ├── login_session_service.py # ★ Redis Session + 递增锁定引擎（新增）
│       ├── sys_user_service.py      # 新增 ban/unban/lock/unlock/batchBan + check_account_status
│       └── sys_login_log_service.py # 支持 login_duration_ms 参数
│
└── common/
    └── constant.py                  # 新增 ACCOUNT_BANNED(220)/ACCOUNT_LOCKED(221)/LOGIN_FREQUENT(222)/SESSION_EXPIRED(223)
```

## 3.2 关键实现：双重鉴权

`aiops/auth/routes/auth_deps.py` — `get_current_user()`:

```python
async def get_current_user(...) -> dict:
    # 1. JWT 解析 userId
    token = credentials.credentials
    user_id = JwtUtil.get_user_id(token)

    # 2. Redis Session 存在性校验
    redis = await get_redis()
    session_valid = await is_session_valid(redis, str(user_id))

    # 3. Session 不存在 → 401（已过期或被踢下线）
    if not session_valid:
        raise HTTPException(401, "登录会话已过期，请重新登录")

    return {"user_id": ..., "username": ...}
```

## 3.3 关键实现：递增降级锁定引擎

`aiops/auth/service/login_session_service.py`:

```python
ESCALATION_LEVELS = [
    {"max_fails": 5, "lock_minutes": 5, "attempts_after": 3},
    {"max_fails": 3, "lock_minutes": 15, "attempts_after": 2},
    {"max_fails": 2, "lock_minutes": 30, "attempts_after": 2},
    {"max_fails": 2, "lock_minutes": 1440, "attempts_after": 2},
]

async def check_login_allowed(redis, username) -> (bool, str):
    """检查是否允许登录，自动解封到期锁定"""

async def handle_login_fail(redis, username) -> dict:
    """处理登录失败，执行递增降级"""

async def handle_login_success(redis, username):
    """登录成功清除全部锁定状态"""
```

## 3.4 关键实现：账号状态统一检查

`aiops/auth/service/sys_user_service.py` — `check_account_status()`:

```python
async def check_account_status(sys_user) -> None:
    """
    统一入口，检查 sys_user.status：
    - 0 停用 → "账号已被停用，请联系管理员"
    - 2 封禁 → "账号已被封禁/永久封禁。原因：xxx，解封时间：xxx"
    - 3 锁定 → "账号已被锁定，请稍后再试"
    封禁到期自动解封（ban_end_time <= now）
    """
```

## 3.5 环境变量配置

```bash
SESSION_TTL_HOURS=12          # Redis Session 过期时间（小时）
LOGIN_FAIL_MAX_COUNT=5        # 登录失败锁定阈值（已由递增降级策略替代）
LOGIN_FAIL_LOCK_MINUTES=30    # 登录失败锁定时间（已由递增降级策略替代）
MULTI_LOGIN_ENABLED=1         # 多端登录控制（1=允许, 0=禁止）
```

---

# 四、API 接口清单

## 4.1 登录认证（增强）

| 方法 | 路径 | 功能 | 变更 |
|------|------|------|------|
| POST | `/login` | 用户登录 | 新增：Redis Session 写入 + 递增锁定检查 + 封禁状态检查 |
| GET | `/info` | 获取用户信息 | 不变 |
| GET | `/logout` | 用户登出 | 新增：删除 Redis Session |

## 4.2 在线用户管理（新增）

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/admin/onlineUser/list` | 在线用户列表 | `bnt.onlineUser.list` |
| DELETE | `/admin/onlineUser/kick/{userId}` | 强制踢下线 | `bnt.onlineUser.kick` |
| DELETE | `/admin/onlineUser/kickBatch` | 批量踢下线 | `bnt.onlineUser.kick` |

## 4.3 用户管理（新增接口）

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| PUT | `/admin/sysUser/ban` | 封禁用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/unban` | 解封用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/lock/{id}` | 锁定用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/unlock/{id}` | 解锁用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/batchBan` | 批量封禁 | `bnt.sysUser.ban` |

## 4.4 登录日志

| 方法 | 路径 | 功能 | 变更 |
|------|------|------|------|
| GET | `/admin/sysLoginLog/list/{page}/{limit}` | 登录日志分页 | 响应新增 `loginDurationMs` + `msg` 字段增强 |

---

# 五、前后端协作流程

```
前端登录页 → POST /login
  ↓ 后端校验通过
  ↓ Redis 写入 login:user:{userId}
  ↓ 返回 token
  ↓
前端 store 存储 token
  ↓
前端所有请求自动带 Authorization: Bearer {token}
  ↓ 后端 auth_deps.py
  ↓ JWT 解析 + Redis Session 双重校验
  ↓ 通过 → 正常返回
  ↓ 失败 → 401
  ↓
前端 request.ts 拦截器
  ↓ 401 → "登录已过期，请重新登录" → 跳转登录页
```

---

# 六、前端页面

## 6.1 在线用户管理（新增）

```
路径: /#/system/onlineUser/list
组件: src/views/system/onlineUser/list.vue
API:  src/api/system/onlineUser.ts

功能:
- 展示所有在线用户（账号、IP、操作系统、浏览器、登录时间、在线时长、过期时间）
- 单个踢下线（带确认弹窗）
- 批量选中踢下线
- 实时在线人数统计
- 在线时长自动计算（X小时X分钟X秒）
```

## 6.2 用户管理增强

```
路径: /#/system/sysUser/list
组件: src/views/system/sysUser/list.vue
API:  src/api/system/sysUser.ts（新增 ban/lock 方法）

新增功能:
- 状态列：彩色标签（正常/停用/封禁/锁定）
- "更多"下拉菜单：封禁/解封/锁定/解锁
- 封禁对话框：封禁原因 + 永久封禁/指定时间
- 批量封禁：勾选多用户，统一封禁原因和时间
- 详情抽屉：查看用户完整信息
- 编辑对话框：状态改为单选框
```

## 6.3 登录日志增强

```
路径: /#/system/sysLoginLog/list
组件: src/views/system/sysLoginLog/list.vue

新增列:
- 登录耗时（自动格式化：ms/s/分秒）
- 登录信息 msg（显示封锁原因/剩余次数等）
- 状态标签着色（成功=绿，失败=红）
```

## 6.4 HTTP 错误友好提示

```
文件: src/utils/request.ts

状态码映射:
- 401 → "登录已过期，请重新登录"
- 403 → "没有权限访问该资源"
- 404 → "请求的资源不存在"
- 500 → "服务器内部错误"
```

---

# 七、解决的问题

## 7.1 安全性

- **防暴力破解**：4 级递增降级锁定（5min → 15min → 30min → 1day），攻击成本指数级增长
- **主动防御**：管理员可随时封禁可疑账号，支持永久封禁或定时封禁
- **会话控制**：Redis Session 使服务端具备随时踢人能力，Token 泄漏可立即止损
- **审计追踪**：登录日志记录耗时、IP、设备、失败原因，满足安全审计需求

## 7.2 运维效率

- **在线可见**：管理员实时查看当前在线用户，掌握用户活跃情况
- **快速处置**：一键踢下线 + 批量封禁，应急响应效率大幅提升
- **状态清晰**：4 种账号状态 + 彩色标签 + 详细提示信息，运维人员一目了然

## 7.3 用户体验

- **中文友好提示**：所有错误信息均为中文，401/403/500 不再显示英文
- **明确原因告知**：封禁提示原因+解封时间，锁定提示重试时间
- **自动恢复**：封禁到期自动解封，锁定到期自动恢复尝试次数

---

# 八、手动 SQL

```sql
-- sys_user 新增封禁字段
ALTER TABLE sys_user
    ADD COLUMN ban_reason VARCHAR(255) DEFAULT NULL COMMENT '封禁原因',
    ADD COLUMN ban_start_time TIMESTAMP NULL DEFAULT NULL COMMENT '封禁开始时间',
    ADD COLUMN ban_end_time TIMESTAMP NULL DEFAULT NULL COMMENT '封禁结束时间（NULL=永久封禁）';

-- sys_login_log 新增耗时字段
ALTER TABLE sys_login_log
    ADD COLUMN login_duration_ms INT DEFAULT 0 COMMENT '登录耗时(毫秒)';

-- 新增菜单项（在 sys_menu 表中手动插入）
-- 在线用户：component='system/onlineUser/list', perms='bnt.onlineUser.list'
-- 踢下线权限：perms='bnt.onlineUser.kick'
-- 封禁权限：perms='bnt.sysUser.ban'
```
