# 数据库管理中心模块文档（dbcenter）

> **代码行数**: ~10000 | **文件数**: 61 | **最后更新**: 2026-08-08

---

## 一、模块定位

数据库资产的**全生命周期管理**：资产登记、连接账号、表结构、自动备份、云端容灾、完整性校验、健康巡检。解决"数据库靠人工 mysqldump、备份文件散落本地、没人校验、坏了不知道"的运维痛点。

```
数据库登记（地址/端口/类型/凭证）
  → 备份策略（cron + 保留天数）→ 定时 mysqldump → 上传 OSS/COS → 跨云复制
  → 完整性校验（定时）→ 过期清理（回收站）
  → 数据库巡检（连接/慢查询/表空间/版本）→ 检查报告
  → AI 助手联动：向 ai 模块提供库/表/列结构
```

---

## 二、数据模型（10 表）

| 表 | 关键字段 | 说明 |
|---|---|---|
| ops_database | host/port/db_type/username | 数据库资产（排除本地 IP 备份） |
| ops_database_auth | database_id/user/password(加密) | 连接账号（Fernet 加密） |
| ops_database_table | database_id/table_name | 表清单（AI 助手用） |
| ops_database_backup | database_id/backup_name/file_path/status/cloud_status/log_message | 备份记录 |
| ops_database_backup_policy | database_id(唯一)/retention_days/enable_compression/enable_verify/status | 备份策略（**status=0 时调度器不执行**） |
| ops_backup_replication | 目标类型(OSS/COS)/桶/路径 | 云端异地复制配置 |
| ops_backup_replication_log | backup_id/target_type/sync_status/error_message | 同步日志（失败检测依据） |
| ops_database_check_config | database_id/检查项 | 巡检配置 |
| ops_database_check_record | database_id/检查结果 JSON | 巡检记录 |

---

## 三、备份全流程

### 3.1 调度触发（run_scheduled_backups）

```
APScheduler（每分钟唤醒，internal 模式）
  → 读配置中心 db_backup_cron 的 enabled + cron
      enabled=0 → return；match_cron 不匹配 → return
  → 查询启用策略（status=1）+ 排除本地 IP（127.0.0.1/localhost）
  → 防重复：同一库最近 2 分钟有备份记录则跳过
  → 执行 execute_backup_now(database_id)
```

**★ 排查经验（2026-08-08 实际踩坑）**：备份策略 `status=0`（禁用）时调度器**静默 return 无日志**——排查"备份没触发"先看策略是否启用，再看 db_backup_cron 的 enabled。

### 3.2 执行器（execute_backup_now）

```
① 构建 mysqldump 前缀：
   mysqldump -u xxx -p'xxx' --single-transaction --no-tablespaces
             --routines --triggers --set-gtid-purged=OFF --skip-events {db}
   （--single-transaction：InnoDB 一致性读不加锁；--routines/--triggers 导存储过程触发器）
② 模式分派：
   - 指定表（table_names 非空）：逐表导 全量/结构(--no-data)/数据(--no-create-info) 三份 → 汇总
   - 全库（table_names 空）：直接整库三份（"执行 0 张表" = 全库模式，非异常）
③ 本地模式：本地执行 mysqldump + tar.gz 打包
   远程模式：SSH 连接 → 远程 mysqldump -h 127.0.0.1（SSH 隧道访问 MySQL）→ 远端打包
④ 备份记录写入（含 log_message 完整日志）
⑤ 云端同步：sync_backup_to_cloud → 按策略上传 OSS/COS（本地文件不存在时 SFTP 拉取再传）
⑥ 跨云复制：ops_backup_replication 配置 → 备份文件 OSS↔COS 复制，异地容灾
⑦ 失败检测：备份记录 log_message 判云端同步失败 → 单独通知（dispatch_sync_failed）
```

### 3.3 校验与清理

- **完整性校验**（run_scheduled_verifies）：读 db_verify_cron 配置 → 查启用校验的策略 → 校验该库最新备份（文件存在+大小），2 分钟内已校验/已通过则跳过
- **过期清理**（run_scheduled_cleanup，每小时）：查策略 retention_days → 超期备份移入回收站（{BACKUP_ROOT_DIR}/.trash，软删记录）→ 清理超过保留时限的回收站

### 3.4 通知联动

| 事件 | 通知类型 | 渠道（配置中心 notification.scene.* 控制） |
|---|---|---|
| 备份失败 | db_backup_failed | 邮件/飞书/钉钉/企微 |
| 云端同步失败 | db_sync_failed | 同上 |
| 策略变更 | db_policy_change | 同上 |
| 巡检结果 | db_inspection | 同上 |

---

## 四、数据库巡检（ops_database_inspection）

```
定时（db_check_cron，enabled 开关，internal 模式）
  → 对每库执行健康检查：连接 / 慢查询 / 表空间 / 连接数 / 版本信息
  → 结果 JSON 写入 ops_database_check_record
  → 异常项 → dispatch_inspection 通知
```

检查配置（ops_database_check_config）可逐库定制检查项。

---

## 五、云存储对接

| 平台 | 路由 | SDK | 能力 |
|---|---|---|---|
| 阿里云 OSS | aliyun_oss.py | oss2 | 桶管理/文件列表/上传 |
| 腾讯云 COS | tencent_cos.py | cos-python-sdk-v5 | 桶管理/文件列表/上传 |

全局 AccessKey 在 .env，单库可覆盖（ops_backup_replication 支持自定义 AK）。

---

## 六、跨模块 API（api/ 子包）

| API | 消费方 | 用途 |
|---|---|---|
| database_query_api.query_database_for_assistant | ai 模块 | DB 助手取库信息 |
| table_query_api.query_tables_for_assistant / get_db_connection_info | ai 模块 | 表清单/连接信息 |
| mysql_column_api.fetch_mysql_columns | ai 模块 | 连真实库 SHOW FULL COLUMNS 取列（防幻觉关键） |
| backup_query_api | statistics | 备份统计（Dashboard） |
| inspection_query_api | statistics | 巡检记录统计 |

---

## 七、要点

1. **--single-transaction 一致性备份**：InnoDB 快照读不加锁，生产库可安全备份
2. **SSH 隧道远程备份**：备份不落本地、目标机直接执行，本地/远程两种模式
3. **云端双存储 + 跨云复制**：OSS/COS 可配，异地容灾
4. **完整闭环**：备份 → 上传 → 校验 → 清理 → 失败通知，全自动
5. **"执行 0 张表"= 全库模式**（日志语义，非异常）
6. **与 AI 联动**：真实表结构注入 DB 助手 Prompt 防幻觉
