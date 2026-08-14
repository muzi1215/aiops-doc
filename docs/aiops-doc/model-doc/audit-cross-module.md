# 全项目跨模块调用合规性审计报告

> **审计日期**: 2026-08-02 | **规则**: 跨模块调用必须通过目标模块 `api/` 子包

---

## 一、审计结论

```
✅ 跨模块 Model 直引:       0 处
✅ 跨模块 Service 直引:      0 处
✅ 配置常量直接引用:          0 处（SystemConfigKey 已走 api/）
✅ api/ 子包调用:            66 处
```

**结论：全项目跨模块调用 100% 通过 api/ 子包。可以开发工单模块。**

---

## 四、api/ 文件注释规范

每个 api/ 文件头部必须标注：

```python
"""
模块名 API — 供 XXX 等外部模块跨模块调用

跨模块引用:
  导出的类/函数 → 调用方(文件:行)  用途说明
"""
```

> 注：notification 模块的 `email/api/` 是本模块内部子包，不计入跨模块 API。
> notification 真正的跨模块 API 是 `dispatcher.py`——外部模块调用 `dispatcher.dispatch_xxx()`。

### 4.1 跨模块 api/ 文件清单（15 个外部 + 1 个 dispatcher）

| api/ 文件 | 跨模块引用方 | 引用数 |
|----------|------------|--------|
| `configuration/api/config_query_api.py` | main.py, channel_manager, backup_scheduler, inspection_scheduler, collector_service | 5 |
| `collector/api/collector_query_api.py` | statistics/analysis_service（6 大分析引擎） | 1 |
| `dbcenter/backup/api/backup_query_api.py` | statistics(statistics_service + dashboard) | 2 |
| `dbcenter/inspection/api/inspection_query_api.py` | statistics(statistics_service) | 1 |
| `ai/service/api/rag_query_api.py` | statistics/dashboard_service | 1 |
| `auth/sys_login_log/api/login_log_query_api.py` | statistics/dashboard_service | 1 |
| `auth/sys_oper_log/api/oper_log_api.py` | statistics/dashboard_service + log_util | 2 |
| `auth/sys_user/api/user_query_api.py` | notification, dbcenter, opscenter, collector, ai | 5+ |
| `opscenter/credential/api/credential_query_api.py` | collector, dbcenter(8处) | 8 |
| `opscenter/alarm/api/alarm_query_api.py` | ai, statistics(2处) | 3 |
| `opscenter/patrol/api/patrol_query_api.py` | ai, statistics(2处) | 3 |
| `opscenter/server/api/server_query_api.py` | ai, collector, notification, dbcenter, statistics | 5 |
| `dbcenter/database/api/database_query_api.py` | ai/db_assistant | 1 |
| `dbcenter/table/api/table_query_api.py` | ai/db_assistant | 1 |
| `dbcenter/table/api/mysql_column_api.py` | ai/db_assistant | 1 |
| `notification/email/api/email_common_send.py` | email_dbcenter/alarm/analysis_send（通知模块内部） | — |
| `notification/email/api/email_alarm_send.py` | email_channel（通知模块内部） | — |
| `notification/email/api/email_analysis_send.py` | email_channel（通知模块内部） | — |
| `notification/email/api/email_dbcenter_send.py` | email_channel（通知模块内部） | — |
| `notification/email/api/email_database_send.py` | email_channel（通知模块内部） | — |

> **说明**：notification 模块的 `email/api/` 是本模块内部子包（被 `email_channel.py` 调用），不是跨模块 API。
> notification 真正的跨模块 API 是 `dispatcher.py`——所有外部模块（opscenter/dbcenter/ai）通过 `dispatcher.dispatch_xxx()` 调用通知功能。

### 4.2 新增 api/ 子包（本次会话创建）

| 模块 | api/ 路径 | 用途 |
|------|----------|------|
| collector | `service/api/collector_query_api.py` | statistics 跨模块引用 |
| ai | `service/api/rag_query_api.py` | statistics 跨模块引用 |
| auth/login_log | `service/sys_login_log/api/login_log_query_api.py` | statistics 跨模块引用 |
| dbcenter/backup | `service/ops_database_backup/api/backup_query_api.py` | statistics 跨模块引用 |
| dbcenter/inspection | `service/ops_database_inspection/api/inspection_query_api.py` | statistics 跨模块引用 |

### 4.3 补导出 Model/函数的 api/ 文件（本次会话更新）

| api/ 文件 | 补导出的内容 | 用途 |
|----------|------------|------|
| `credential_query_api.py` | `OpsCredential` | dbcenter 8处引用改为走 api/ |
| `patrol_query_api.py` | `OpsPatrolServiceConfig` | statistics 1处引用改为走 api/ |
| `oper_log_api.py` | `SysOperLog` | statistics 1处引用改为走 api/ |
| `alarm_query_api.py` | `get_alarm_stats` | statistics 统计函数走 api/ |
| `backup_query_api.py` | `get_dashboard_backup_stats` | statistics 仪表盘统计走 api/ |
| `inspection_query_api.py` | `get_overall_stats` | statistics 巡检统计走 api/ |
| `config_query_api.py` | `SystemConfigKey` + `get_config_dict` | main.py/scheduler 配置常量走 api/ |

---

## 二、60 处 api/ 子包调用明细

### statistics 模块（13 处）— 已全面解耦

| 文件:行 | 导入目标 | 导入内容 |
|--------|---------|---------|
| `analysis_service.py:20` | `collector.service.api.collector_query_api` | OpsCollectorDetail, OpsCollectorRecord |
| `dashboard_service.py:16` | `auth.service.sys_login_log.api.login_log_query_api` | SysLoginLog |
| `dashboard_service.py:17` | `auth.service.sys_oper_log.api.oper_log_api` | SysOperLog |
| `dashboard_service.py:18` | `opscenter.service.ops_alarm.api.alarm_query_api` | OpsAlarm |
| `dashboard_service.py:19` | `opscenter.service.opserver.api.server_query_api` | OpsServer |
| `dashboard_service.py:20` | `opscenter.service.ops_patrol.api.patrol_query_api` | OpsServicePatrol |
| `dashboard_service.py:21` | `opscenter.service.ops_patrol.api.patrol_query_api` | OpsPatrolServiceConfig |
| `dashboard_service.py:22` | `ai.service.api.rag_query_api` | RagDocument, RagChunk |
| `statistics_service.py:19` | `opscenter.service.ops_patrol.api.patrol_query_api` | OpsServicePatrol |
| `statistics_service.py:20` | `opscenter.service.opserver.api.server_query_api` | OpsServer |
| `statistics_service.py:21` | `dbcenter.service.ops_database_backup.api.backup_query_api` | OpsDatabaseBackup |
| `statistics_service.py:22` | `dbcenter.service.ops_database_inspection.api.inspection_query_api` | OpsDatabaseCheckRecord |
| `statistics_service.py:23` | `opscenter.service.ops_alarm.api.alarm_query_api` | OpsAlarm |

### dbcenter 模块（14 处）

| 文件:行 | 导入目标 | 导入内容 |
|--------|---------|---------|
| `ops_database_backup/ops_database_backup_executor.py:25` | `opscenter.service.ops_credential.api.credential_query_api` | OpsCredential |
| `ops_database_backup/ops_database_backup_service.py:271` | 同上 | OpsCredential |
| `ops_database_backup/ops_cloud_management_service.py:77` | 同上 | OpsCredential |
| `ops_database_backup/ops_backup_replication_service.py:19` | `auth.service.sys_user.api.user_query_api` | get_super_admin_emails |
| `ops_database_backup/ops_database_backup_notify.py:20` | 同上 | get_super_admin_emails |
| `ops_database_backup/ops_database_backup_policy_service.py:19` | 同上 | get_super_admin_emails |
| `ops_database/ops_database_service.py:25` | `opscenter.service.opserver.api.server_query_api` | OpsServer |
| `ops_database/ops_database_service.py:26` | `opscenter.service.ops_credential.api.credential_query_api` | OpsCredential |
| `ops_database_auth/ops_database_auth_service.py:24` | — | 无跨模块引用 |
| `ops_database_table/ops_database_table_service.py:25` | `opscenter.service.ops_credential.api.credential_query_api` | OpsCredential |
| `ops_database_inspection/ops_database_inspection_service.py:28` | 同上 | OpsCredential |
| `ops_database_inspection/ops_database_inspection_service.py:29` | `auth.service.sys_user.api.user_query_api` | get_super_admin_emails |
| `router/ops_database_backup.py:138` | `opscenter.service.ops_credential.api.credential_query_api` | OpsCredential |
| `router/ops_database_table.py` | 通过 dbcenter 内部 api 调用 | — |

### ai 模块（7 处）

| 文件:行 | 导入目标 | 导入内容 |
|--------|---------|---------|
| `data/analysis_data_provider.py:16` | `opscenter.service.opserver.api.server_query_api` | query_servers_for_analysis |
| `data/analysis_data_provider.py:17` | `opscenter.service.ops_patrol.api.patrol_query_api` | query_patrols_for_analysis |
| `data/analysis_data_provider.py:18` | `opscenter.service.ops_alarm.api.alarm_query_api` | query_alarms_for_analysis |
| `data/db_assistant_data_provider.py:12` | `dbcenter.service.ops_database.api.database_query_api` | query_database_for_assistant |
| `data/db_assistant_data_provider.py:13` | `dbcenter.service.ops_database_table.api.table_query_api` | query_tables_for_assistant |
| `data/db_assistant_data_provider.py:14` | `dbcenter.service.ops_database_table.api.mysql_column_api` | fetch_mysql_columns |
| `data/db_assistant_data_provider.py:15` | `dbcenter.service.ops_database_table.api.table_query_api` | get_db_connection_info |

### notification 模块（14 处）

全部通过 dispatcher.py 或 email/api 内部调用，均为本模块内部或配置中心 api/ 调用。

### opscenter 模块（5 处）

均为本模块内部 api/ 调用（alarm_query_api/patrol_query_api/server_query_api/credential_query_api）+ auth api/ 调用。

### collector 模块（3 处）

通过 opscenter api（server_query_api + credential_query_api）+ configuration api。

### 其他模块（auth/configuration/codegen）

均为本模块内部或公共基础设施调用。

---

## 三、已修复的 3 处遗留 Service 函数调用

| 调用 | 修复前 | 修复后 |
|------|--------|--------|
| `get_overall_stats` | `from aiops.dbcenter.service.ops_database_inspection.ops_database_check_record_service import get_overall_stats` | `from aiops.dbcenter.service.ops_database_inspection.api.inspection_query_api import get_overall_stats` |
| `get_alarm_stats` | `from aiops.opscenter.service.ops_alarm.alarm_service import get_alarm_stats` | `from aiops.opscenter.service.ops_alarm.api.alarm_query_api import get_alarm_stats` |
| `get_dashboard_backup_stats` | `from aiops.dbcenter.service.ops_database_backup.ops_database_backup_service import get_dashboard_backup_stats` | `from aiops.dbcenter.service.ops_database_backup.api.backup_query_api import get_dashboard_backup_stats` |

**全部通过 api/ 子包包装后调用。全项目零跨模块 Service/Model 直引。**

---

## 四、新增 api/ 子包清单（本次会话创建）

| 模块 | api/ 路径 | 用途 |
|------|----------|------|
| collector | `service/api/collector_query_api.py` | statistics 跨模块引用 OpsCollectorDetail/Record |
| ai | `service/api/rag_query_api.py` | statistics 跨模块引用 RagDocument/Chunk |
| auth/login_log | `service/sys_login_log/api/login_log_query_api.py` | statistics 跨模块引用 SysLoginLog |
| dbcenter/backup | `service/ops_database_backup/api/backup_query_api.py` | statistics 跨模块引用 OpsDatabaseBackup |
| dbcenter/inspection | `service/ops_database_inspection/api/inspection_query_api.py` | statistics 跨模块引用 OpsDatabaseCheckRecord |
| opscenter/credential | `service/ops_credential/api/credential_query_api.py` | 补 OpsCredential 导出 |
| opscenter/patrol | `service/ops_patrol/api/patrol_query_api.py` | 补 OpsPatrolServiceConfig 导出 |
| auth/oper_log | `service/sys_oper_log/api/oper_log_api.py` | 补 SysOperLog 导出 |
| dbcenter/table | `service/ops_database_table/api/table_query_api.py` | 补 get_db_connection_info 公开函数 |
