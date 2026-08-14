# 路由权限与操作日志全量清单

> **日期**: 2026-08-02 | **覆盖范围**: 全项目 12 个模块、200+ 个路由端点

---

## 一、权限字符串汇总（bnt.* 去重）

按资源归并，覆盖所有路由中出现的权限标识：

| 资源 | 权限点 |
|------|--------|
| sysUser | `list` `add` `update` `remove` `edit.password` `status` `ban` |
| sysMenu | `list` `add` `update` `remove` |
| sysRole | `list` `add` `update` `remove` `batchRemove` `assignAuth` |
| sysDept | `list` `add` `update` `remove` |
| sysPost | `list` `add` `update` `remove` |
| sysAnnouncement | `list` `add` `update` `remove` |
| onlineUser | `list` `kick` |
| opsAlarm | `list` `update` `remove` |
| opsCredential | `list` `add` `update` `remove` |
| opsPatrolServiceConfig | `list` `add` `update` `remove` |
| opsServicePatrol | `list` `start` `remove` |
| opsPatrolRule | `list` `save` `toggle` `remove` |
| opsServer | `list` `add` `update` `remove` `startSync` |
| sshExec | `execute` |
| opsDatabase | `list` `add` `update` `remove` `export` |
| opsDatabaseAuth | `list` `add` `update` `remove` `updatePassword` |
| opsDatabaseBackup | `list` `add` `remove` |
| opsDatabaseBackupPolicy | `list` `add` |
| opsBackupReplication | `list` `add` `remove` |
| opsDatabaseCheckConfig | `saveOrupdate` |
| aliyunOss | `list` `download` `upload` |
| tencentCos | `list` `download` `upload` |
| opsCollector | `list` `remove` `trigger` `triggerAll` `config` |
| systemConfig | `list` `update` |
| aiAnalysis | `generate` `sendEmail` |
| aiLogAnalysis | `generate` |
| ragDocuments | `upload` `list` `remove` |

---

## 二、按模块路由详情

约定：`@Log` 的 `applicationName` 均为 `"AIops运维平台"`，表中只标 `BusinessType`。

### 2.1 auth（认证授权）

#### sys_user

| 方法 | URL | 权限 | Log |
|------|-----|------|-----|
| GET | `/sysUser/list/{page}/{limit}` | `bnt.sysUser.list` | — |
| PUT | `/sysUser/updatePassword/{id}/{password}` | `bnt.sysUser.edit.password` | UPDATE |
| PUT | `/sysUser/update` | `bnt.sysUser.update` | UPDATE |
| PUT | `/sysUser/updateStatus/{id}/{status}` | `bnt.sysUser.status` | UPDATE |
| POST | `/sysUser/save` | `bnt.sysUser.add` | INSERT |
| DELETE | `/sysUser/remove/{id}` | `bnt.sysUser.remove` | DELETE |
| DELETE | `/sysUser/batchRemove` | `bnt.sysUser.remove` | DELETE |
| PUT | `/sysUser/ban` | `bnt.sysUser.ban` | UPDATE |
| PUT | `/sysUser/unban` | `bnt.sysUser.ban` | UPDATE |
| PUT | `/sysUser/lock/{id}` | `bnt.sysUser.ban` | UPDATE |
| PUT | `/sysUser/unlock/{id}` | `bnt.sysUser.ban` | UPDATE |
| PUT | `/sysUser/batchBan` | `bnt.sysUser.ban` | UPDATE |

#### sys_role / sys_menu / sys_dept / sys_post

| 模块 | 方法 | URL | 权限 | Log |
|------|------|-----|------|-----|
| sysRole | GET | `/sysRole/list/{page}/{limit}` | `bnt.sysRole.list` | — |
| sysRole | POST | `/sysRole/save` | `bnt.sysRole.add` | INSERT |
| sysRole | PUT | `/sysRole/update` | `bnt.sysRole.update` | UPDATE |
| sysRole | DELETE | `/sysRole/remove/{id}` | `bnt.sysRole.remove` | DELETE |
| sysRole | DELETE | `/sysRole/batchRemove` | `bnt.sysRole.batchRemove` | DELETE |
| sysRole | POST | `/sysRole/doAssign` | `bnt.sysRole.assignAuth` | ASSIGN |
| sysMenu | GET | `/sysMenu/findNodes` | `bnt.sysMenu.list` | — |
| sysMenu | GET | `/sysMenu/list/{page}/{limit}` | `bnt.sysMenu.list` | — |
| sysMenu | POST | `/sysMenu/save` | `bnt.sysMenu.add` | INSERT |
| sysMenu | PUT | `/sysMenu/update` | `bnt.sysMenu.update` | UPDATE |
| sysMenu | DELETE | `/sysMenu/remove/{id}` | `bnt.sysMenu.remove` | DELETE |
| sysMenu | POST | `/sysMenu/doAssign` | `bnt.sysRole.assignAuth` | ASSIGN |
| sysDept | GET | `/sysDept/list/{page}/{limit}` | `bnt.sysDept.list` | — |
| sysDept | POST | `/sysDept/save` | `bnt.sysDept.add` | INSERT |
| sysDept | PUT | `/sysDept/update` | `bnt.sysDept.update` | UPDATE |
| sysDept | DELETE | `/sysDept/remove/{id}` | `bnt.sysDept.remove` | DELETE |
| sysPost | GET | `/sysPost/list/{page}/{limit}` | `bnt.sysPost.list` | — |
| sysPost | POST | `/sysPost/save` | `bnt.sysPost.add` | INSERT |
| sysPost | PUT | `/sysPost/update` | `bnt.sysPost.update` | UPDATE |
| sysPost | DELETE | `/sysPost/remove/{id}` | `bnt.sysPost.remove` | DELETE |

#### sys_announcement / online_user

| 模块 | 方法 | URL | 权限 | Log |
|------|------|-----|------|-----|
| sysAnnouncement | GET | `/sysAnnouncement/list/{page}/{limit}` | `bnt.sysAnnouncement.list` | — |
| sysAnnouncement | POST | `/sysAnnouncement/save` | `bnt.sysAnnouncement.add` | INSERT |
| sysAnnouncement | PUT | `/sysAnnouncement/update` | `bnt.sysAnnouncement.update` | UPDATE |
| sysAnnouncement | DELETE | `/sysAnnouncement/remove/{id}` | `bnt.sysAnnouncement.remove` | DELETE |
| onlineUser | GET | `/onlineUser/list` | `bnt.onlineUser.list` | — |
| onlineUser | DELETE | `/onlineUser/kick/{userId}` | `bnt.onlineUser.kick` | — |
| onlineUser | DELETE | `/onlineUser/kickBatch` | `bnt.onlineUser.kick` | BICKUP |

### 2.2 opscenter（服务器运维）

| 模块 | 方法 | URL | 权限 | Log |
|------|------|-----|------|-----|
| opsServer | GET | `/opsServer/list/{page}/{limit}` | `bnt.opsServer.list` | — |
| opsServer | POST | `/opsServer/save` | `bnt.opsServer.add` | INSERT |
| opsServer | PUT | `/opsServer/update` | `bnt.opsServer.update` | UPDATE |
| opsServer | DELETE | `/opsServer/remove/{id}` | `bnt.opsServer.remove` | DELETE |
| opsServer | GET | `/opsServer/startSyncServer` | `bnt.opsServer.startSync` | SYNC |
| opsAlarm | GET | `/opsAlarm/list/{page}/{limit}` | `bnt.opsAlarm.list` | — |
| opsAlarm | PUT | `/opsAlarm/updateStatus` | `bnt.opsAlarm.update` | UPDATE |
| opsAlarm | DELETE | `/opsAlarm/remove/{id}` | `bnt.opsAlarm.remove` | DELETE |
| opsAlarm | DELETE | `/opsAlarm/batchRemove` | `bnt.opsAlarm.remove` | DELETE |
| opsAlarm | POST | `/opsAlarm/sendEmail/{id}` | `bnt.opsAlarm.update` | — |
| opsCredential | GET | `/opsCredential/list/{page}/{limit}` | `bnt.opsCredential.list` | — |
| opsCredential | POST | `/opsCredential/save` | `bnt.opsCredential.add` | INSERT |
| opsCredential | PUT | `/opsCredential/update` | `bnt.opsCredential.update` | UPDATE |
| opsCredential | DELETE | `/opsCredential/remove/{id}` | `bnt.opsCredential.remove` | DELETE |
| opsPatrolServiceConfig | POST | `/opsPatrolServiceConfig/save` | `bnt.opsPatrolServiceConfig.add` | INSERT |
| opsPatrolServiceConfig | PUT | `/opsPatrolServiceConfig/update` | `bnt.opsPatrolServiceConfig.update` | UPDATE |
| opsPatrolServiceConfig | DELETE | `/opsPatrolServiceConfig/remove/{id}` | `bnt.opsPatrolServiceConfig.remove` | DELETE |
| opsServicePatrol | GET | `/opsServicePatrol/list/{page}/{limit}` | `bnt.opsServicePatrol.list` | — |
| opsServicePatrol | GET | `/opsServicePatrol/manualStartPatrol` | `bnt.opsServicePatrol.start` | INSPECTOR |
| opsServicePatrol | DELETE | `/opsServicePatrol/remove/{id}` | `bnt.opsServicePatrol.remove` | DELETE |
| opsPatrolRule | GET | `/opsPatrolRule/list/{page}/{limit}` | `bnt.opsPatrolRule.list` | — |
| opsPatrolRule | POST | `/opsPatrolRule/save` | `bnt.opsPatrolRule.save` | INSERT |
| opsPatrolRule | PUT | `/opsPatrolRule/toggle/{id}` | `bnt.opsPatrolRule.toggle` | — |
| opsPatrolRule | DELETE | `/opsPatrolRule/remove/{id}` | `bnt.opsPatrolRule.remove` | DELETE |
| sshExec | POST | `/sshExec/execute` | `bnt.sshExec.execute` | OTHER |

### 2.3 dbcenter（数据库管理中心）

| 模块 | 方法 | URL | 权限 | Log |
|------|------|-----|------|-----|
| opsDatabase | GET | `/opsDatabase/list/{page}/{limit}` | `bnt.opsDatabase.list` | — |
| opsDatabase | POST | `/opsDatabase/save` | `bnt.opsDatabase.add` | INSERT |
| opsDatabase | PUT | `/opsDatabase/update` | `bnt.opsDatabase.update` | UPDATE |
| opsDatabase | DELETE | `/opsDatabase/remove/{id}` | `bnt.opsDatabase.remove` | DELETE |
| opsDatabase | POST | `/opsDatabase/sync/{id}` | `bnt.opsDatabase.update` | SYNC |
| opsDatabaseAuth | GET | `/opsDatabaseAuth/list/{page}/{limit}` | `bnt.opsDatabaseAuth.list` | — |
| opsDatabaseAuth | POST | `/opsDatabaseAuth/save` | `bnt.opsDatabaseAuth.add` | INSERT |
| opsDatabaseAuth | PUT | `/opsDatabaseAuth/update` | `bnt.opsDatabaseAuth.update` | UPDATE |
| opsDatabaseAuth | DELETE | `/opsDatabaseAuth/remove/{id}` | `bnt.opsDatabaseAuth.remove` | DELETE |
| opsDatabaseAuth | POST | `/opsDatabaseAuth/sendCode/{id}` | `bnt.opsDatabaseAuth.updatePassword` | SEND |
| opsDatabaseAuth | PUT | `/opsDatabaseAuth/updatePassword` | `bnt.opsDatabaseAuth.updatePassword` | UPDATE |
| opsDatabaseBackup | GET | `/opsDatabaseBackup/list/{database_id}/{page}/{limit}` | `bnt.opsDatabaseBackup.list` | — |
| opsDatabaseBackup | POST | `/opsDatabaseBackup/backupNow` | `bnt.opsDatabaseBackup.add` | BACKUP |
| opsDatabaseBackup | GET | `/opsDatabaseBackup/download/{id}` | `bnt.opsDatabaseBackup.list` | DOWNLOAD |
| opsDatabaseBackup | POST | `/opsDatabaseBackup/verify/{id}` | `bnt.opsDatabaseBackup.list` | VALIDATION |
| opsDatabaseBackup | DELETE | `/opsDatabaseBackup/remove/{id}` | `bnt.opsDatabaseBackup.remove` | DELETE |
| opsDatabaseBackupPolicy | GET | `/opsDatabaseBackupPolicy/get/{database_id}` | `bnt.opsDatabaseBackupPolicy.list` | — |
| opsDatabaseBackupPolicy | POST | `/opsDatabaseBackupPolicy/save` | `bnt.opsDatabaseBackupPolicy.add` | INSERT |
| opsDatabaseTable | GET | `/opsDatabaseTable/list/{database_id}/{page}/{limit}` | `bnt.opsDatabase.list` | — |
| opsDatabaseTable | POST | `/opsDatabaseTable/sync/{database_id}` | `bnt.opsDatabase.update` | SYNC |
| opsDatabaseTable | GET | `/opsDatabaseTable/export/{database_id}` | `bnt.opsDatabase.export` | EXPORT |
| opsBackupReplication | GET | `/opsBackupReplication/list/{policy_id}` | `bnt.opsBackupReplication.list` | — |
| opsBackupReplication | POST | `/opsBackupReplication/save` | `bnt.opsBackupReplication.add` | INSERT |
| opsBackupReplication | DELETE | `/opsBackupReplication/remove/{id}` | `bnt.opsBackupReplication.remove` | DELETE |
| opsDatabaseInspection | POST | `/opsDatabaseInspection/run/{database_id}` | `bnt.opsDatabase.update` | INSPECTOR |
| opsDatabaseInspection | POST | `/opsDatabaseInspection/aiAnalysis/{record_id}` | `bnt.opsDatabase.update` | ANALYSIS |
| opsDatabaseCheckConfig | POST | `/opsDatabaseCheckConfig/save` | `bnt.opsDatabaseCheckConfig.saveOrupdate` | INSERT |
| opsDatabaseCheckRecord | DELETE | `/opsDatabaseCheckRecord/remove/{id}` | `bnt.opsDatabase.remove` | DELETE |
| aliyunOss | GET | `/aliyunOss/list` | `bnt.aliyunOss.list` | — |
| aliyunOss | GET | `/aliyunOss/downloadByKey` | `bnt.aliyunOss.download` | DOWNLOAD |
| aliyunOss | POST | `/aliyunOss/upload/{backup_id}` | `bnt.aliyunOss.upload` | SYNC |
| aliyunOss | GET | `/aliyunOss/download/{backup_id}` | `bnt.aliyunOss.download` | DOWNLOAD |
| tencentCos | GET | `/tencentCos/list` | `bnt.tencentCos.list` | — |
| tencentCos | GET | `/tencentCos/downloadByKey` | `bnt.tencentCos.download` | DOWNLOAD |
| tencentCos | POST | `/tencentCos/upload/{backup_id}` | `bnt.tencentCos.upload` | SYNC |
| tencentCos | GET | `/tencentCos/download/{backup_id}` | `bnt.tencentCos.download` | DOWNLOAD |

### 2.4 ai / collector / configuration

| 模块 | 方法 | URL | 权限 | Log |
|------|------|-----|------|-----|
| aiAnalysis | POST | `/aiAnalysis/generate` | `bnt.aiAnalysis.generate` | ANALYSIS |
| aiAnalysis | POST | `/aiAnalysis/sendEmail` | `bnt.aiAnalysis.sendEmail` | SEND |
| aiLogAnalysis | POST | `/logAnalysis/analyze` | `bnt.aiLogAnalysis.generate` | ANALYSIS |
| ragDocuments | POST | `/rag/documents/upload` | `bnt.ragDocuments.upload` | INSERT |
| ragDocuments | DELETE | `/rag/documents/remove/{doc_id}` | `bnt.ragDocuments.remove` | DELETE |
| aiDbAssistant | GET | `/aiDbAssistant/chat/{database_id}` | **无** | ANALYSIS |
| aiDbAssistant | POST | `/aiDbAssistant/sendEmail` | **无** | SEND |
| opsCollector | GET | `/record/list/{page}/{limit}` | `bnt.opsCollector.list` | — |
| opsCollector | DELETE | `/record/remove/{id}` | `bnt.opsCollector.remove` | DELETE |
| opsCollector | POST | `/trigger` | `bnt.opsCollector.trigger` | COLLECTION |
| opsCollector | POST | `/triggerAll` | `bnt.opsCollector.triggerAll` | COLLECTION |
| opsCollector | POST | `/config/saveByKey` | **无** | UPDATE |
| opsCollector | POST | `/config/save` | `bnt.opsCollector.config` | UPDATE |
| systemConfig | GET | `/system/config/list/{page}/{limit}` | `bnt.systemConfig.list` | — |
| systemConfig | PUT | `/system/config` | `bnt.systemConfig.update` | UPDATE |
| systemConfig | PUT | `/system/config/batch` | `bnt.systemConfig.update` | UPDATE |
| systemConfig | POST | `/system/config/reload` | `bnt.systemConfig.update` | — |

---

## 三、已知问题

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | **无权限校验** | `aiDbAssistant` 2 个端点、`collector /config/saveByKey` | 未登录用户也能调 |
| 2 | **权限全部注释** | `statistics/` 4 个路由 | 统计页面无权限控制 |
| 3 | **codegen 无权限** | `codegen/` 全部端点 | 代码生成器无访问控制 |
| 4 | **权限命名不一致** | `opsPatrolRule.save` vs 其他模块 `add` | 同一个"新增"操作用了不同 action 名 |

---

## 四、数据库菜单初始化 SQL

```sql
-- 配置中心菜单（init_database.sql）
INSERT IGNORE INTO sys_menu (id, parent_id, name, type, path, component, perms, icon, sort_value, status, create_time, update_time, is_deleted)
VALUES
('menu_system_config',   '0', '系统配置', 0, '/systemConfig', 'system/systemConfig/index', 'bnt.systemConfig.list',   'setting', 10, 1, NOW(), NOW(), 0),
('btn_system_config_list','menu_system_config', '配置列表', 1, '', '', 'bnt.systemConfig.list',   '', 1, 1, NOW(), NOW(), 0),
('btn_system_config_update','menu_system_config','修改配置',1, '', '', 'bnt.systemConfig.update', '', 2, 1, NOW(), NOW(), 0);
```

其余菜单通过后端 sysMenu API 动态管理，不通过 SQL 初始化。


---

## 五、@Log 装饰器开发规范

### 5.1 必须传入 `request: Request`

`@Log` 装饰器从 `kwargs.get('request')` 提取以下信息写入 `sys_oper_log` 表：

| 字段 | 来源 | 说明 |
|------|------|------|
| `oper_name` | `Authorization: Bearer <token>` → `JwtUtil.get_user_name()` | 操作人 |
| `oper_ip` | `X-Forwarded-For` > `X-Real-IP` > `request.client.host` | 客户端 IP |
| `oper_url` | `request.url.path` | 请求路径 |
| `request_method` | `request.method` | GET/POST/PUT/DELETE |
| `address` | `ip-api.com` 查询 IP 归属地 | 操作地理位置 |

**如果路由函数签名中没有 `request: Request`，以上字段全部为空。**

### 5.2 正确写法

```python
from fastapi import Request

@router.post("/xxx/save", ...)
@Log(title="XXX管理", businessType=BusinessType.INSERT)
async def xxx_save(request: Request, param: XxxParam = Body(...), db: AsyncSession = Depends(get_db)):
    ...
```

### 5.3 错误写法

```python
# ❌ 缺少 request: Request → oper_name/oper_ip/oper_url/request_method/address 全空
@router.post("/xxx/save", ...)
@Log(title="XXX管理", businessType=BusinessType.INSERT)
async def xxx_save(param: XxxParam = Body(...), db: AsyncSession = Depends(get_db)):
    ...
```

### 5.4 完整字段写入

`@Log` 装饰器在 `finally` 块（无论成功/异常）调用 `add_operation_log()` 写入以下完整字段：

| 数据库字段 | 装饰器来源 |
|-----------|----------|
| `title` | `@Log(title=...)` |
| `business_type` | `@Log(businessType=...)` |
| `method` | `func.__module__ + func.__qualname__` |
| `request_method` | `request.method` |
| `operator_type` | `@Log(operatorType=...)` |
| `application_name` | `@Log(applicationName=...)` |
| `oper_name` | JWT Token 解析 |
| `oper_url` | `request.url.path` |
| `oper_ip` | `get_client_ip(request)` |
| `address` | `get_ip_address(oper_ip)` |
| `oper_param` | 请求参数 JSON（排除 request/db/credentials） |
| `json_result` | 返回值 JSON — 成功时序列化 `return` 值，异常时自动构造 `{"code":e.code,"message":e.msg,...}` |
| `status` | 0=成功 1=异常 |
| `error_msg` | 异常信息（失败时，截断 2000 字符） |
| `oper_time` | `datetime.now()` |

**异常时的 json_result 自动构造**（`log_util.py:252-264`）：`BusinessException` → `{"code": e.code, "message": e.msg, "data": null, "totalCount": 0}`；其他异常 → `{"code": 500, "message": "...", "data": null}`。确保失败记录也能看到完整的错误响应体。
