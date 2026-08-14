# AIops — auth 认证授权模块（基石模块）

> 版本：v2.0 | 更新时间：2026-08-01 | 作者：lx
>
> **auth 是整个 AIops 平台的基石**。所有后续模块（server、dbcenter、collector、statistics、ai、notification）的开发均基于 auth 提供的用户认证、角色权限、部门管理、公告通知等基础设施。
>
> **跨模块调用规范**：其他模块通过 `auth/service/*/api/` 子包获取用户数据，不直接引用 Model 或 Service。

---

# 一、需求分析

## 1.1 业务背景

AIops 智能运维平台面向企业运维团队，需要管理多部门、多角色的用户访问。不同于简单的单用户系统，平台需要：

- **多部门隔离**：不同部门的运维人员只能看到自己部门的服务器和数据库
- **精细化权限**：管理员、普通运维、只读用户需要不同的操作权限
- **操作审计**：所有关键操作需要记录操作日志，便于事后追责
- **公告通知**：巡检异常、系统维护等需要实时推送给在线用户
- **安全认证**：密码加密存储，Token 过期自动失效，防止暴力破解

## 1.2 功能需求清单

| 需求编号 | 功能 | 说明 |
|----------|------|------|
| AUTH-01 | 用户管理 | CRUD + 分页查询 + 密码修改 + 状态启用/禁用 |
| AUTH-02 | 角色管理 | CRUD + 分页查询 + 菜单权限分配 |
| AUTH-03 | 菜单管理 | 树形结构 + 按钮级权限（bnt.{module}.{action}） |
| AUTH-04 | 部门管理 | 树形结构 + 部门用户关联 |
| AUTH-05 | 岗位管理 | 岗位 CRUD + 用户岗位关联 |
| AUTH-06 | 登录认证 | 用户名/密码登录 + JWT Token 签发 |
| AUTH-07 | Token 刷新 | Token 过期前刷新，避免频繁登录 |
| AUTH-08 | 密码加密 | bcrypt 加密存储 + 旧 MD5 自动升级 |
| AUTH-09 | 公告管理 | CRUD + 图片上传 + 实时 WebSocket 推送 |
| AUTH-10 | 登录日志 | 自动记录登录 IP/时间/设备 |
| AUTH-11 | 操作日志 | @Log 装饰器自动记录操作（INSERT/UPDATE/DELETE） |
| AUTH-12 | Dashboard | 服务器/数据库/巡检/告警数量统计 |
| AUTH-13 | 登录管理体系 | Redis Session + 在线用户 + 递增降级锁定 + 封禁管理（详见 module-login-management.md） |

---

# 二、系统设计

## 2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    auth 模块                          │
├─────────────┬──────────────┬──────────────┬─────────┤
│  用户管理    │  角色权限     │  部门岗位     │  公告    │
│  (sys_user) │ (sys_role)   │ (sys_dept)   │(sys_ann) │
├─────────────┴──────────────┴──────────────┴─────────┤
│              认证中间层（auth_deps.py）               │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ JWT 验证      │  │ 权限拦截     │  │ 用户注入     │ │
│  │ (HS512)      │  │ (require_)  │  │ (get_curr_) │ │
│  └──────────────┘  └─────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────┤
│              基础设施（common/util）                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │JWT工具   │ │异常处理   │ │统一响应   │ │日志装饰 │ │
│  │jwt_util  │ │exception │ │result_   │ │log_util │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└─────────────────────────────────────────────────────┘
```

## 2.2 数据库设计（11 张表）

```
sys_user (用户表)
  ├── id, username, password, name, phone, email
  ├── dept_id (FK → sys_dept), post_id (FK → sys_post)
  ├── status (0=停用/1=正常/2=封禁/3=锁定), avatar, description
  ├── ban_reason, ban_start_time, ban_end_time (★ 新增封禁字段)
  ├── feishu_id, wecom_id, dingtalk_id (★ 消息渠道ID：飞书/企业微信/钉钉)
  └── is_deleted (软删除)

sys_role (角色表)
  ├── id, role_name, role_code, role_type (0=超级管理员)
  ├── status, description, data_scope
  └── is_deleted

sys_user_role (用户-角色关联表)
  └── user_id (FK), role_id (FK)

sys_menu (菜单表)
  ├── id, parent_id (树形结构), name, type (0=目录/1=菜单/2=按钮)
  ├── path, component, perms (权限标识: bnt.sysUser.list)
  ├── icon, sort_value, status, hide
  └── is_deleted

sys_role_menu (角色-菜单关联表)
  └── role_id (FK), menu_id (FK)

sys_dept (部门表)
  ├── id, parent_id (树形), name, leader, leader_id (★ 负责人ID，对应 sys_user.id，由用户选择驱动名称同步), phone
  ├── sort_value, status
  └── is_deleted

sys_post (岗位表)
  ├── id, post_code, post_name
  ├── status, description
  └── is_deleted

sys_announcement (公告表)
  ├── id, title, content, image_url
  ├── status (草稿/已发布), notify_now (是否立即推送)
  └── is_deleted

sys_login_log (登录日志表)
  ├── id, username, ipaddr, browser, os
  ├── status (成功/失败), msg (失败原因)
  ├── login_duration_ms (★ 新增：登录耗时毫秒)
  └── create_time

sys_oper_log (操作日志表)
  ├── id, title, business_type (INSERT/UPDATE/DELETE/OTHER)
  ├── method, request_method, oper_name, oper_url, oper_ip
  ├── oper_param (请求参数), json_result (响应结果)
  └── create_time

sys_icon (图标表)
  ├── id, icon_name, icon_class
  ├── status
  └── is_deleted
```

### 设计关键点

1. **软删除**：所有表使用 `is_deleted` 字段（0=正常/1=已删除），查询时必须过滤
2. **RBAC 模型**：用户 → 角色 → 菜单权限，权限标识格式 `bnt.{module}.{action}`
3. **树形结构**：菜单和部门使用 `parent_id` 自关联实现无限层级
4. **数据权限**：角色通过 `data_scope` 字段控制部门数据可见范围
5. **密码安全**：bcrypt 存储（60 字符），兼容旧 MD5 自动升级

## 2.3 认证流程（已升级为双重鉴权）

```
用户登录 (POST /auth/login)
  ↓
check_account_status()            # 检查停用/封禁/锁定
  ↓
check_login_allowed()             # Redis 递增降级锁定检查
  ↓
验证用户名/密码 (bcrypt/旧MD5兼容)
  ↓ 失败 → handle_login_fail() → 递增降级
  ↓ 成功
签发 JWT Token (HS512, 7天过期)
  ↓
create_session()                  # ★ Redis Session (login:user:{id}, TTL 12h)
  ↓
记录登录日志 (IP/浏览器/OS/耗时)
  ↓
返回 { token, userInfo, menus, permissions }

后续请求:
  ↓
Header: Authorization: Bearer <token>
  ↓
auth_deps.get_current_user() → 解密 JWT → ★ Redis Session 校验
  ↓ 失败 → 401 "登录已过期"
  ↓ 成功
auth_deps.require_perms("bnt.sysUser.list") → 检查权限
  ↓
执行业务逻辑

退出登录:
  ↓
DELETE login:user:{userId}        # ★ 删除 Redis Session
  ↓
下次请求 → Redis 不存在 → 401
```

> **登录管理体系完整文档**：参见 `docs/module-login-management.md`

## 2.4 Token 设计

```python
# JWT Payload
{
    "sub": "admin",           # 用户名
    "iat": 1690000000,        # 签发时间
    "exp": 1690604800,        # 过期时间（7天）
    "user_id": "1234567890"   # 用户ID
}

# 签名算法: HS512
# 密钥: 来自环境变量 TOKEN_SIGN_KEY
```

---

# 三、核心实现

## 3.1 目录结构

```
aiops/auth/
├── model/                    # 数据模型（11 表）
│   ├── sys_user.py           # 用户
│   ├── sys_role.py           # 角色
│   ├── sys_user_role.py      # 用户-角色关联
│   ├── sys_menu.py           # 菜单
│   ├── sys_role_menu.py      # 角色-菜单关联
│   ├── sys_dept.py           # 部门
│   ├── sys_post.py           # 岗位
│   ├── sys_announcement.py   # 公告
│   ├── sys_login_log.py      # 登录日志
│   ├── sys_oper_log.py       # 操作日志
│   └── sys_icon.py           # 图标
│
├── routes/                   # 路由层（14 文件）
│   ├── auth_deps.py          # ★ 认证依赖（JWT + Redis Session 双重校验）
│   ├── login.py              # ★ 登录: Redis Session + 递增锁定 + 封禁检查
│   ├── online_user.py        # ★ 在线用户管理（新增）
│   ├── dashboard.py          # Dashboard 数据
│   ├── sys_user.py           # 用户 CRUD + ★ ban/unban/lock/unlock/batchBan
│   ├── sys_role.py           # 角色 CRUD + 权限分配
│   ├── sys_menu.py           # 菜单 CRUD + 树查询
│   ├── sys_dept.py           # 部门 CRUD + 树查询
│   ├── sys_post.py           # 岗位 CRUD
│   ├── sys_announcement.py   # 公告 CRUD + 发布
│   ├── sys_login_log.py      # 登录日志查询
│   ├── sys_oper_log.py       # 操作日志查询
│   └── sys_icon.py           # 图标查询
│
├── schemas/                  # Pydantic 请求/响应模型
│   ├── sys_user_schema.py
│   ├── sys_role_schema.py
│   ├── sys_menu_schema.py
│   ├── sys_dept_schema.py
│   ├── sys_post_schema.py
│   ├── sys_announcement_schema.py
│   └── login_schema.py
│
└── service/                  # 业务逻辑层
    ├── sys_user/
    │   ├── sys_user_service.py
    │   └── api/               # ★ 跨模块 API
    │       └── user_query_api.py  # get_super_admin_emails / get_user_info_by_id / get_user_by_id_and_validate
    │
    ├── sys_oper_log/
    │   ├── sys_oper_log_service.py
    │   └── api/               # ★ 跨模块 API
    │       └── oper_log_api.py    # add_operation_log
    │
    ├── login_session_service.py # ★ Redis Session + 递增降级锁定引擎
    ├── sys_role_service.py
    ├── sys_menu_service.py
    ├── sys_dept_service.py
    ├── sys_post_service.py
    ├── sys_announcement_service.py
    ├── sys_login_log_service.py
    ├── sys_icon_service.py
    └── dashboard_service.py
```

## 3.1b 跨模块 API 层（新增）

```
auth/service/
├── sys_user/api/user_query_api.py
│   ├── get_super_admin_emails(db)        → dbcenter/notification 获取超级管理员邮箱列表
│   ├── get_user_info_by_id(db, user_id)  → notification 获取用户姓名和邮箱
│   └── get_user_by_id_and_validate(db, id)→ opscenter 获取用户完整信息（抛异常版）
│
└── sys_oper_log/api/oper_log_api.py
    └── add_operation_log(db, **kwargs)    → util/log_util @Log 装饰器写入操作日志
```

**设计原则**：外部模块不直接 `import auth.model.sys_user` 或 `import auth.service.sys_user_service`，统一通过 `auth/service/*/api/` 子包调用。Router 层的 `require_perms` / `get_current_user` 作为框架依赖注入保持不变。

## 3.2 关键实现：认证依赖注入

`aiops/auth/routes/auth_deps.py` — 三个核心函数：

```python
# 1. Token 提取 + 验证 → 获取当前用户
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> dict:
    payload = jwt_decode(token)           # JWT 解密
    username = payload.get("sub")
    user = await db.query(SysUser).filter(
        SysUser.username == username,
        SysUser.is_deleted == 0
    ).first()
    return {"username": user.username, "user_id": user.id, ...}


# 2. 权限拦截 — 路由级
def require_perms(*perms: str):
    """装饰器工厂：检查当前用户是否拥有指定权限"""
    async def checker(current_user = Depends(get_current_user), db = Depends(get_db)):
        user_perms = await get_user_permissions(db, current_user["user_id"])
        if not set(perms).issubset(user_perms):
            raise BusinessException(code=403, msg="权限不足")
        return True
    return checker


# 3. 路由使用
@router.get("/list", dependencies=[Depends(require_perms("bnt.sysUser.list"))])
async def sys_user_list(...):
    ...
```

## 3.3 关键实现：密码安全

```python
# bcrypt 主方案（60 字符 hash）
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

# 旧 MD5 兼容（自动升级）
if len(stored_password) == 32:             # MD5 特征: 32 字符
    if hashlib.md5(password.encode()).hexdigest() == stored_password:
        # 验证通过 → 自动升级为 bcrypt
        user.password = bcrypt.hashpw(...)
        await db.commit()
```

## 3.4 关键实现：WebSocket 公告推送

`aiops/common/ws_manager.py` — 单例模式管理所有 WebSocket 连接：

```
POST /auth/announcement/add (notify_now=1)
  ↓
保存公告到数据库
  ↓
ws_manager.broadcast(json.dumps({
    "type": "announcement",
    "data": {"id": ..., "title": ...}
}))
  ↓
所有已连接的客户端收到实时推送
  ↓
死连接自动从连接池剔除
```

## 3.5 关键实现：操作日志

`aiops/util/log_util.py` — `@Log` 装饰器自动记录：

```python
@Log(title="用户管理", businessType=BusinessType.INSERT)
async def sys_user_add(param: SysUserAddParam, db: AsyncSession):
    # 装饰器自动在函数执行前后记录：
    #   - 操作人 IP
    #   - 请求参数 (oper_param)
    #   - 响应结果 (json_result)
    #   - 执行耗时
    # 写入 sys_oper_log 表
    ...
```

## 3.6 关键实现：统一响应格式

`aiops/common/result_response.py`:

```python
# StandardJSONResponse — 所有 API 自动包装为统一格式
{
    "code": 200,
    "message": "success",
    "totalCount": 100,   # 分页时返回
    "data": [...]         # 实际数据
}
```

## 3.7 关键实现：异常处理

`aiops/common/exception.py` — 全局异常处理器：

```python
# 业务异常（业务逻辑错误）
raise BusinessException(code=ResponseCode.DATA_ERROR)           # 预设错误码
raise BusinessException(code=5001, msg="自定义消息")            # 自定义

# 全局 handler 自动捕获：
#   BusinessException → {"code": 5001, "message": "自定义消息"}
#   ValidationError   → {"code": 400,  "message": "参数校验失败"}
#   Exception         → {"code": 500,  "message": "服务器内部错误"}
```

---

# 四、API 接口清单

## 4.1 认证接口（增强）

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| POST | `/login` | ★ 用户登录（Redis Session + 递增锁定 + 封禁检查） | 无 |
| GET | `/logout` | ★ 用户登出（删除 Redis Session） | 登录即可 |
| GET | `/info` | 获取当前用户信息+菜单+权限 | 登录即可 |

## 4.2 用户管理

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/auth/sysUser/list` | 分页查询用户 | `bnt.sysUser.list` |
| GET | `/auth/sysUser/{id}` | 查询用户详情 | `bnt.sysUser.list` |
| POST | `/auth/sysUser/add` | 新增用户 | `bnt.sysUser.add` |
| PUT | `/auth/sysUser/update` | 修改用户 | `bnt.sysUser.update` |
| DELETE | `/auth/sysUser/{id}` | 删除用户 | `bnt.sysUser.remove` |
| PUT | `/auth/sysUser/password` | 修改密码 | `bnt.sysUser.update` |
| PUT | `/auth/sysUser/status` | 修改状态 | `bnt.sysUser.update` |
| GET | `/auth/sysUser/assignRole/{id}` | 查询用户角色 | `bnt.sysUser.assign` |
| POST | `/auth/sysUser/assignRole` | 分配角色 | `bnt.sysUser.assign` |

## 4.3 角色管理

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/auth/sysRole/list` | 分页查询角色 | `bnt.sysRole.list` |
| GET | `/auth/sysRole/{id}` | 查询角色详情 | `bnt.sysRole.list` |
| POST | `/auth/sysRole/add` | 新增角色 | `bnt.sysRole.add` |
| PUT | `/auth/sysRole/update` | 修改角色 | `bnt.sysRole.update` |
| DELETE | `/auth/sysRole/{id}` | 删除角色 | `bnt.sysRole.remove` |
| GET | `/auth/sysRole/assignMenu/{id}` | 查询角色菜单 | `bnt.sysRole.assign` |
| POST | `/auth/sysRole/assignMenu` | 分配菜单权限 | `bnt.sysRole.assign` |

## 4.4 菜单/部门/岗位/公告

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/auth/sysMenu/tree` | 菜单树 |
| GET | `/auth/sysDept/tree` | 部门树 |
| GET | `/auth/sysPost/list` | 岗位列表 |
| GET | `/auth/sysAnnouncement/list` | 公告分页 |
| POST | `/auth/sysAnnouncement/add` | 新增公告 |
| WS | `/ws/announcement` | WebSocket 实时推送 |

## 4.5 Dashboard

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/auth/dashboard` | 仪表盘数据（服务器数/数据库数/巡检数/告警数） |

## 4.5b 在线用户管理（★ 新增）

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/admin/onlineUser/list` | 在线用户列表 | `bnt.onlineUser.list` |
| DELETE | `/admin/onlineUser/kick/{userId}` | 强制踢下线 | `bnt.onlineUser.kick` |
| DELETE | `/admin/onlineUser/kickBatch` | 批量踢下线 | `bnt.onlineUser.kick` |

## 4.5c 封禁/锁定管理（★ 新增）

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| PUT | `/admin/sysUser/ban` | 封禁用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/unban` | 解封用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/lock/{id}` | 锁定用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/unlock/{id}` | 解锁用户 | `bnt.sysUser.ban` |
| PUT | `/admin/sysUser/batchBan` | 批量封禁 | `bnt.sysUser.ban` |

## 4.6 日志

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/admin/sysLoginLog/list/{page}/{limit}` | 登录日志分页（★ 新增 loginDurationMs + msg 增强） |
| GET | `/admin/sysOperLog/list/{page}/{limit}` | 操作日志分页 |

---

# 五、解决的问题

## 5.1 安全性

- **密码不落地**：bcrypt 单向加密，即使数据库泄漏也无法还原明文
- **会话无状态**：JWT Token 不依赖服务端 Session，支持水平扩展
- **旧密码兼容**：历史 MD5 密码验证通过后自动升级为 bcrypt，无缝迁移
- **权限最小化**：每个 API 接口声明所需权限，无权限自动拦截

## 5.2 多租户隔离

- **部门数据隔离**：通过 `data_scope` 控制角色可查看的部门数据范围
- **软删除**：删除操作不物理删除数据，仅标记 `is_deleted=1`，数据可恢复
- **操作审计**：所有 INSERT/UPDATE/DELETE 操作自动记录操作日志

## 5.3 开发效率

- **路由级权限声明**：`Depends(require_perms("bnt.sysUser.list"))` 一行代码完成权限控制
- **自动日志记录**：`@Log(title="...")` 一行装饰器完成操作日志
- **统一异常处理**：业务代码只需 `raise BusinessException(...)`，全局 handler 自动格式化
- **自动 API 文档**：FastAPI 自动生成 OpenAPI 文档（`/docs`），前端可直接参考

## 5.4 可扩展性

- **模块化路由**：每个功能独立路由文件，新增功能不影响已有模块
- **权限命名规范**：`bnt.{module}.{action}` 格式，新增模块时自然扩展
- **WebSocket 架构**：单例 `ws_manager` 支持任意数量客户端连接，后续模块可复用

---

# 六、对下游模块的支撑

auth 模块为所有下游模块提供的核心能力：

| 能力 | 下游模块使用方式 |
|------|-----------------|
| 用户认证 | `Depends(get_current_user)` — 所有模块路由统一使用 |
| 权限控制 | `Depends(require_perms("bnt.server.list"))` — server/dbcenter 等模块各自定义权限标识 |
| 操作日志 | `@Log(title="服务器管理", ...)` — 所有 CRUD 操作自动记录 |
| 统一响应 | `StandardJSONResponse` — 所有 API 自动包装为 `{code, message, data}` 格式 |
| 异常处理 | `BusinessException` — 所有模块统一抛出 |
| WebSocket | `ws_manager` — 公告推送、巡检告警等可复用连接管理 |
| 用户上下文 | `current_user["username"]` / `current_user["user_id"]` — 业务逻辑中获取当前操作用户 |

> **server 模块**直接依赖 auth 的 RBAC 权限体系，每个服务器管理接口都声明了 `bnt.server.*` 权限。**dbcenter 模块**同理使用 `bnt.database.*` 权限。所有模块共享 auth 提供的用户认证和操作审计能力。
