# 数据备份与云端同步模块文档

> **涉及模块**: dbcenter + storage + crypto_util | **最后更新**: 2026-08-02

---

## 一、全景架构

```
触发入口
  ├── 定时: main.py:137  APScheduler run_scheduled_backups（cron=db_backup_cron）
  └── 手动: POST /admin/opsDatabaseBackup/backup

      ▼
execute_backup_now(db, database_id)
  ops_database_backup_executor.py
  │
  ├── Step 1-7: mysqldump → .tar.gz → 写入 ops_database_backup
  │
  └── Step 8: sync_backup_to_cloud()
        ops_database_backup_sync.py:47
        │
        ├── 查备份策略 → 查启用的云端副本 (ops_backup_replication)
        ├── SFTP 拉取远程备份（如需要）
        ├── 按 sync_order 逐个云端:
        │     ├── get_backend("oss"/"cos")  → storage/registry.py
        │     ├── backend.exists(cloud_key) → 去重
        │     ├── backend.upload(local_file, cloud_key) → 上传
        │     └── write_replication_log(sync_status=1/2) → 写日志
        └── 清理 SFTP 临时文件
              │
              ▼
        storage/base.py  → OSSBackend / COSBackend  → 阿里云/腾讯云 SDK
```

---

## 二、涉及数据表

```
ops_database ──1:1──→ ops_database_backup_policy ──1:N──→ ops_backup_replication
                              │                                    │
                    每次备份后 INSERT              每次云端同步后 INSERT
                              │                                    │
                              ▼                                    ▼
                   ops_database_backup               ops_backup_replication_log
```

| 表 | 用途 |
|---|------|
| `ops_database` | 数据库资产（IP/端口/类型） |
| `ops_database_backup_policy` | 备份策略（cron/保留天数） |
| `ops_database_backup` | 备份记录（文件路径/大小/状态） |
| `ops_backup_replication` | 云端副本配置（AK/SK/bucket/sync_order） |
| `ops_backup_replication_log` | 云端同步日志（sync_status: 1=成功 2=失败） |

---

## 三、文件结构

```
dbcenter/service/ops_database_backup/
├── ops_database_backup_scheduler.py       ← 定时调度入口
├── ops_database_backup_executor.py        ← ★ 备份执行引擎
├── ops_database_backup_sync.py            ← ★ 云端同步引擎
├── ops_database_backup_service.py         ← 备份 CRUD
├── ops_backup_replication_service.py      ← 云端副本 CRUD + 同步日志
├── ops_database_backup_policy_service.py  ← 策略 CRUD
├── ops_database_backup_verify.py          ← 完整性校验
└── ops_database_backup_cleanup.py         ← 过期清理
```

---

## 四、核心调用链

### 4.1 定时触发 → 开关检查 → **配置中心读取链路**

```
main.py:137  scheduler.add_job(run_scheduled_backups, "cron", minute="*")

ops_database_backup_scheduler.py:58  run_scheduled_backups()
  │
  ├── ① ★ 读配置中心
  │      from aiops.configuration.api.config_query_api import get_config_dict  ← 通过 api/ 子包
  │      backup_config = await get_config_dict(db, "db_backup_cron")
  │      → ConfigService.query_by_key("db_backup_cron")
  │        → SELECT * FROM ops_system_config WHERE config_key='db_backup_cron' AND is_deleted=0
  │        → {"config_key": "db_backup_cron", "config_value": "0 58 22 * * ?", "enabled": 0}
  │
  │      if not backup_config.get("enabled"):
  │          return  ← enabled=0 → 全局备份关闭，直接退出
  │
  ├── ② match_cron(config_value, current_minute)
  │      backup_cron = backup_config.get("config_value", "0 0 2 * * ?")
  │      match_cron("0 58 22 * * ?", now) → True/False
  │      不匹配 → return
  │
  ├── ③ 查启用策略的数据库
  │      SELECT * FROM ops_database_backup_policy WHERE status=1 AND is_deleted=0
  │
  └── ④ 逐个调用 execute_backup_now(db, database_id)

校验调度器同样模式:
  scheduler.py:168  get_config_dict(db, "db_verify_cron")
  → enabled 判断 + match_cron → 遍历 enable_verify=1 的策略 → 逐个校验
```

### 4.2 备份执行

```
ops_database_backup_executor.py  execute_backup_now()

  Step 1: 查数据库资产 + 连接账号
  Step 2: 判断本地/远程 (_is_local_host)
  Step 3: 远程 → 查 SSH 凭据 → decrypt_field(credential.password)
  Step 4: INSERT ops_database_backup (status=0 执行中)
  Step 5: 执行 mysqldump → tar.gz
      本地: mysqldump -h{host} -P{port} -u{user} -p{password} {db} > total.sql
      远程: paramiko SSH → 远程执行 mysqldump → 远程打包 → SFTP 下载到本地
  Step 6: UPDATE 备份记录 (status=1, file_size, backup_path, duration)
  Step 7: 文件存 BACKUP_ROOT_DIR/{db_name}/{backup_name}.tar.gz
  Step 8: ★ sync_result = await sync_backup_to_cloud(...)
```

### 4.3 云端同步 — 完整代码逐行注释

**位置**：`ops_database_backup_sync.py:47` — `sync_backup_to_cloud()`

```
sync_backup_to_cloud(db, backup, database, backup_path, backup_name, ssh_info)
│
├── Step 1: 查备份策略 (:70)
│     SELECT * FROM ops_database_backup_policy
│     WHERE database_id = backup.database_id AND is_deleted = 0
│     没有策略 → return "无备份策略，跳过云端同步"
│
├── Step 2: 查启用的云端副本配置 (:82)
│     query_enabled_replications(db, policy_id)
│     → SELECT * FROM ops_backup_replication
│       WHERE policy_id = ? AND enabled = 1 AND is_deleted = 0
│       ORDER BY sync_order
│
│     ⚠️ 注意：access_key_secret 在 get_replication_by_id() 中已经通过
│        decrypt_field() 解密为明文，所以 rep.access_key_secret 可以直接传给 SDK
│
├── Step 3: SFTP 拉取（远程备份 + 本地不存在时）(:95-128)
│     sftp_fetch_remote_file() → storage/util.py
│
├── ★ Step 4: 构造云端路径 + 逐个云端上传 (:135-181)
│     for rep in sorted(replications, key=lambda r: r.sync_order):
│
│       ╔══════════════════════════════════════════════════════════╗
│       ║  ★ 云端路径（OSS/COS key）是怎么拼出来的？              ║
│       ╚══════════════════════════════════════════════════════════╝
│
│       ① rep.base_directory  → 来自 ops_backup_replication 表
│          例如: "backup/mysql"（默认值）
│
│       ② database.name       → 来自 ops_database 表，函数的 database 参数
│          函数签名: sync_backup_to_cloud(db, backup, database, ...)
│          调用方传入: database = await db.execute(select(OpsDatabase).where(...))
│          database.name = "my_production_db"
│
│       ③ backup_name         → 来自备份文件
│          backup_name = "backup_20260802_120000.tar.gz"
│
│       ④ 拼接: (:137)
│          target_key = f"{rep.base_directory.rstrip('/')}/{database.name}/{backup_name}"
│
│          最终结果示例:
│            backup/mysql/my_production_db/backup_20260802_120000.tar.gz
│
│       ⑤ ⭐ 不需要在云端预创建目录！
│          OSS/COS 的对象存储是扁平的 key-value 结构，没有"文件夹"概念。
│          当你上传 key = "backup/mysql/my_db/file.tar.gz" 时：
│          - SDK 直接把整个字符串当作对象 key 写入
│          - 控制台/管理页面把 "/" 渲染成文件夹结构（纯视觉展示）
│          - 不存在"创建目录"这个 API 调用
│          - 所以不需要任何预创建操作，直接 upload 即可
│
│       ⑥ 去重检查 (:151)
│          await asyncio.to_thread(backend.exists, target_key)
│          → OSS: client.head_object(HeadObjectRequest(bucket, key))
│          → COS: client.head_object(Bucket, Key)
│          如果返回 200 → 文件已存在 → skip + 写成功日志 → continue
│          如果返回 404 → 文件不存在 → 继续上传
│
│       ⑦ 执行上传 (:162)
│          backend = get_backend("oss", bucket=rep.bucket, ...)
│          await asyncio.to_thread(backend.upload, local_file, target_key)
│
│          OSS 底层 (base.py:160):
│            client.put_object(PutObjectRequest(bucket, key, body=file_bytes))
│          COS 底层 (base.py:244):
│            client.upload_file(Bucket=bucket, LocalFilePath=local_file, Key=key)
│
│          返回 URL:
│            OSS: https://{bucket}.oss-{region}.aliyuncs.com/{key}
│            COS: https://{bucket}.cos.{region}.myqcloud.com/{key}
│
│       ⑧ 写同步日志 (:165-169)
│          write_replication_log(backup_id, rep_id, target_type, 1, target_key, file_size)
│          → INSERT INTO ops_backup_replication_log
│            (backup_id, replication_id, target_type, sync_status=1, target_key, file_size, sync_time)
│
│       ⑨ 失败处理 (:172-181)
│          单个云端失败 → write_replication_log(sync_status=2) + 继续下一个
│          不影响本地备份文件，也不影响其他云端
│
└── Step 5: 清理 SFTP 临时文件 (:184-188)
      if temp_download: os.unlink(temp_download)
```

### 4.4 云端路径全景图

```
ops_backup_replication 表（云端副本配置）
├── target_type = "oss"
├── bucket = "aiops-backup"
├── base_directory = "backup/mysql"         ← ① 云端目录前缀
└── access_key_secret = "已解密"

ops_database 表（数据库资产）
└── name = "my_production_db"              ← ② 数据库名称

备份文件名
└── backup_name = "backup_20260802_120000.tar.gz"  ← ③ 文件名

         拼接后
           ↓
cloud_key = "backup/mysql/my_production_db/backup_20260802_120000.tar.gz"

在 OSS 控制台看到的目录结构：
  aiops-backup/
    └── backup/
        └── mysql/
            └── my_production_db/
                └── backup_20260802_120000.tar.gz

⭐ 这些"目录"是 OSS/COS 控制台根据 key 中的 "/" 渲染出来的视觉效果，
   不是真实存在的文件夹。不需要任何 mkdir 操作。
```

### 4.5 如果数据库名称变化了、云端目录结构也会跟着变

```
database.name = "old_name"  → cloud_key = "backup/mysql/old_name/xxx.tar.gz"
数据库重命名为 "new_name"   → cloud_key = "backup/mysql/new_name/xxx.tar.gz"

云端会出现两个"目录"，旧文件不会被自动清理。
需要手动在 OSS/COS 管理页面删除旧目录下的文件，或等过期清理策略自动删除。
```

---

## 五、全局 Cron vs 策略独立 Cron（设计决策）

### 5.1 当前设计：全局 Cron

```
ops_system_config.db_backup_cron  →  调度器 match_cron(全局cron)  →  遍历所有 status=1 的策略  →  逐个 execute_backup_now
ops_system_config.db_verify_cron  →  调度器 match_cron(全局cron)  →  遍历所有 enable_verify=1 的策略  →  逐个校验
ops_system_config.db_check_cron   →  同上
ops_system_config.collector_cron  →  同上
```

**所有库共用同一个 cron 表达式**。策略表只控制该策略是否参与：

| 策略字段 | 作用 |
|---------|------|
| `status` | 是否参与定时备份 |
| `enable_verify` | 是否参与定时校验 |
| `retention_days` | 该库的备份保留天数（可差异化） |

### 5.2 为什么选择全局

| 维度 | 全局 cron | 策略独立 cron |
|------|----------|-------------|
| 适用场景 | 同一服务器少量库 | 多服务器/多租户/库数量>20 |
| 当前需求 | ✅ 完全满足 | ❌ 超出实际需求 |
| 运维复杂度 | 改一处全局生效 | 每个库要单独配，忘了就漏备 |
| 代码复杂度 | 调度器 3 行读配置 | 每个策略读自己字段 + 兼容 NULL |
| 前端复杂度 | 配置中心一个输入框 | 策略页面里嵌 cron 编辑器 |

### 5.3 差异化需求怎么处理

```
库 A（生产）→ 全局 cron 2:00，retention_days=30  ← 策略表控制保留天数
库 B（测试）→ status=0，不参与自动备份           ← 策略表控制是否参与
库 C（需不同频率）→ 暂时没有，未来如果有：
  → 单独写个 APScheduler job，cron hardcode 或配置中心加新 key
  → 不要因为"未来可能有"就把现在的简单设计复杂化
```

### 5.4 前端已清理

备份策略、数据采集、数据库巡检三个页面的 cron 编辑 UI 已全部移除，替换为配置中心只读展示 + 链接。所有 cron 修改统一走"系统配置"页面。

---

## 六、AK/SK 安全存储

```
保存副本:
  access_key_secret(明文) → encrypt_field() → Fernet 加密 → 写入数据库

读取副本 (get_replication_by_id):
  access_key_secret(密文) → decrypt_field() → Fernet 解密 → 明文传给 SDK

密钥: os.getenv("FERNET_KEY")
实现: aiops/util/crypto_util.py  encrypt_field / decrypt_field
```

---

## 七、关键文件速查

| 要做什么 | 改哪个文件 |
|---------|-----------|
| 新增云存储类型 | `storage/base.py` 加 Backend + `registry.py` 注册 |
| 修改备份 cron | 配置中心改 `db_backup_cron` 的 `config_value` |
| 关闭自动备份 | 配置中心改 `db_backup_cron` 的 `enabled` 为 0 |
| 新增云端副本 | ops_backup_replication 表 INSERT |
| 加密/解密 | `util/crypto_util.py` |
