# AIops — server 服务管理与巡检引擎

> 版本：v2.0 | 更新时间：2026-08-01 | 作者：lx
>
> **server 模块依托于 auth 模块的 RBAC 权限体系开发**。所有接口使用 `bnt.server.*` / `bnt.patrol.*` 等权限标识。
>
> **跨模块调用规范**：其他模块通过 `opscenter/service/*/api/` 子包获取数据，不直接引用 Model 或 Service。

---

# 一、需求分析

## 1.1 业务背景

运维团队日常需要管理大量 Linux 服务器，面临的核心痛点：
- **服务器数量多**：几十甚至上百台，手动管理不现实
- **服务种类多**：Nginx、MySQL、Redis、Docker、Java、K8s 等
- **告警风暴**：短时间大量告警邮件淹没真正问题
- **凭证安全**：SSH 密码/密钥需要加密存储
- **巡检自动化**：7×24 小时自动巡检，异常自动通知

## 1.2 功能需求清单

| 需求编号 | 功能 | 说明 |
|----------|------|------|
| SVR-01 | 服务器管理 | CRUD + 分页查询 + 在线状态 |
| SVR-02 | 凭证管理 | SSH 密码/密钥 AES 加密存储 + 连通性测试 |
| SVR-03 | 服务巡检 | 定时 SSH 采集系统指标 + 服务状态 |
| SVR-04 | 告警管理 | 阈值触发 + 30 分钟窗口聚合 + 邮件通知 |
| SVR-05 | 巡检规则 | 可配置的 CPU/内存/磁盘/服务状态告警阈值 |
| SVR-06 | SSH 执行 | Web 端远程命令执行 |
| SVR-07 | 阿里云集成 | SWAS 轻量服务器列表同步 |
| SVR-08 | 跨模块 API | 提供 `api/` 子包供 AI/采集/通知等模块调用 |

---

# 二、系统设计

## 2.1 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                     opscenter 模块                        │
│  依托于: auth (RBAC权限)                                  │
├─────────────────────┬────────────────────────────────────┤
│   资源管理           │   巡检引擎                          │
│  ┌──────────────┐   │  ┌──────────────────────────────┐  │
│  │ 服务器 CRUD   │   │  │ APScheduler (每 N 分钟)       │  │
│  │ 凭证加密管理  │   │  │   ↓                          │  │
│  │ SSH 远程执行  │   │  │ 查询启用巡检的在线服务器       │  │
│  │ 阿里云同步    │   │  │   ↓                          │  │
│  └──────────────┘   │  │ 逐台 SSH 连接                 │  │
│                     │  │   ↓                          │  │
│  跨模块 API 层       │  │ 系统级 + 服务级采集            │  │
│  ┌──────────────┐   │  │   ↓                          │  │
│  │ server/api/  │   │  │ 规则匹配 → 告警聚合            │  │
│  │ patrol/api/  │   │  │   ↓                          │  │
│  │ alarm/api/   │   │  │ 写入 ops_service_patrol +     │  │
│  │credential/api│   │  │  ops_alarm                   │  │
│  └──────────────┘   │  └──────────────────────────────┘  │
├─────────────────────┴────────────────────────────────────┤
│  外部依赖: Paramiko (SSH) / APScheduler (调度)            │
│             / smtplib (邮件，→ notification 模块)          │
└──────────────────────────────────────────────────────────┘
```

## 2.2 模块划分

```
aiops/opscenter/
├── model/                                   # 数据模型（6 表）
│   ├── ops_server.py
│   ├── ops_credential.py
│   ├── ops_alarm.py
│   ├── ops_service_patrol.py
│   ├── ops_patrol_rule.py
│   └── ops_patrol_service_config.py
│
├── router/                                  # 路由层（8 文件）
│   ├── ops_server.py
│   ├── ops_credential.py
│   ├── ops_alarm.py
│   ├── ops_service_patrol.py
│   ├── ops_patrol_rule.py
│   ├── ops_patrol_service_config.py
│   ├── ssh_exec.py
│   └── aliyun_server.py
│
├── schemas/                                 # Pydantic
│
├── service/                                 # 业务逻辑层
│   ├── opserver/
│   │   ├── ops_server_service.py            # 服务器管理
│   │   ├── server_sync_service.py           # 状态同步
│   │   ├── aliyun_sync_service.py           # 阿里云同步
│   │   └── api/                             # ★ 跨模块 API
│   │       └── server_query_api.py          #    query_servers_for_analysis / query_online_server_by_id 等
│   │
│   ├── ops_credential/
│   │   ├── ops_credential_service.py        # 凭证加密/解密
│   │   └── api/                             # ★ 跨模块 API
│   │       └── credential_query_api.py      #    query_credential_for_module
│   │
│   ├── ops_alarm/
│   │   ├── alarm_service.py                 # 告警管理
│   │   └── api/                             # ★ 跨模块 API
│   │       └── alarm_query_api.py           #    query_alarms_for_analysis
│   │
│   ├── ops_patrol/
│   │   ├── patrol_inspection_service.py     # ★ 巡检编排引擎
│   │   ├── patrol_rule_service.py           # 规则引擎
│   │   ├── server_patrol_service.py         # 巡检记录
│   │   ├── server_config_service.py         # 巡检配置
│   │   ├── api/                             # ★ 跨模块 API
│   │   │   └── patrol_query_api.py          #    query_patrols_for_analysis
│   │   └── collect/
│   │       ├── system.py / docker.py / java.py / mysql.py / nginx.py / redis.py / kubelet.py
│   │
│   └── ssh_exec/
│       └── ssh_exec_service.py
│
└── util/
    ├── parse_param_util.py
    └── server_sync_util.py
```

## 2.3 跨模块 API 层（核心变更）

```
opscenter/service/
├── opserver/api/server_query_api.py
│   ├── query_servers_for_analysis(db, server_id)   → AI 模块获取服务器列表
│   ├── query_online_server_by_id(db, server_id)    → 采集器获取在线服务器
│   ├── query_all_online_servers(db)                → 全量采集
│   └── query_server_leader_id(db, server_id)       → 通知模块获取负责人ID
│
├── ops_patrol/api/patrol_query_api.py
│   └── query_patrols_for_analysis(db, server_ids, since) → AI 模块获取巡检记录
│
├── ops_alarm/api/alarm_query_api.py
│   └── query_alarms_for_analysis(db, server_ids, since)  → AI 模块获取告警记录
│
└── ops_credential/api/credential_query_api.py
    └── query_credential_for_module(db, server_id)  → 采集器获取 SSH 凭据
```

**设计原则**：外部模块不直接 import `opscenter.model.*` 或 `opscenter.service.*`，统一通过 `api/` 子包调用。

## 2.4 巡检引擎流程

```
run_patrol_inspection()  ← APScheduler（cron 来自配置中心 patrol_cron，默认 */5）
  → get_servers_with_credentials：在线 + 启用巡检 + 有启用凭证 三重筛选
  → 逐台 inspect_server：
      ├─ 系统级采集（并发 6 通道，~3 秒）：
      │    CPU(top)/内存(free)/磁盘(df)/inode(df -i)/负载(uptime)/Swap/TCP连接(ss)
      │    /文件句柄(proc)/僵尸进程(ps)/内核错误(dmesg)/核数(nproc)/系统版本
      ├─ evaluate_metric_rules：规则引擎（配置中心 alarm.rules JSON，14 条默认）
      │    ├─ 去抖：Redis INCR 连续 continue_periods 次超阈值才告警
      │    └─ 命中 → create_alarm → 聚合检查 → 工单（独立事务）→ 通知（多渠道并发）
      ├─ 服务级巡检（并发 6 路，每服务独立 SSH 连接 + Semaphore 限流）：
      │    systemctl 状态（备选名适配 mysql→mysqld）
      │    + 专用采集器（MySQL 连接池/慢查询、Nginx、Docker、Redis、Java）
      │    + 规则判警（服务停止/连接池过高/慢查询）
      └─ recover_alarms：本次未触发的未处理告警 → 自动恢复 + 通知
  → 每台服务器巡检完立即 commit（逐台提交，单台异常不丢整轮）
  → 写入 ops_service_patrol + ops_alarm
```

---

# 三、API 接口清单

## 3.1 服务器管理

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | `/server/list` | 分页查询 | `bnt.server.list` |
| POST | `/server/add` | 新增 | `bnt.server.add` |
| PUT | `/server/update` | 修改 | `bnt.server.update` |
| DELETE | `/server/{id}` | 删除 | `bnt.server.remove` |

## 3.2 凭证管理

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/credential/list` | 查询凭证列表 |
| POST | `/credential/add` | 添加凭证 |
| PUT | `/credential/update` | 修改凭证 |
| POST | `/credential/test/{id}` | 测试连通性 |

## 3.3 巡检与告警

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/patrol/record/list` | 巡检记录分页 |
| POST | `/patrol/trigger` | 手动触发巡检 |
| GET | `/alarm/list` | 告警列表 |
| PUT | `/alarm/handle` | 处理告警 |

---

# 四、与各模块的依赖关系

## 4.1 对外提供（其他模块通过 api/ 调用）

```
AI 模块         → server_query_api / patrol_query_api / alarm_query_api
采集模块         → server_query_api / credential_query_api
通知模块         → server_query_api (query_server_leader_id)
```

## 4.2 内部依赖

```
auth 提供                     opscenter 使用
─────────────────────────────────────────────
Depends(require_perms(...))  → 所有路由权限控制
@Log 装饰器                  → 操作审计
auth/api/user_query_api      → 服务器负责人信息查询
```

---

# 五、巡检引擎可靠性优化（2026-08-08）

## 5.1 并发采集（一轮 4 分钟 → 1 分钟内）

| 阶段 | 原实现 | 现实现 |
|---|---|---|
| 系统级 14 条命令 | 串行 ~20 秒 | `asyncio.gather` + Semaphore(6) 并发，~3 秒 |
| 服务级 N 个服务 | 单连接串行 3-4 分钟 | 每服务独立 SSH 连接 + Semaphore(6)（`_collect_single_service`）|
| 写库 | 全部完成后一次性 commit | 每台服务器完成后 commit（单台异常不丢整轮）|

要点：**采集并发、判警/写库串行**（db session 不可并发共享）；并发连接数受 sshd MaxSessions（默认 10）约束，Semaphore 限流 6。

## 5.2 命令级超时（120s）

`ssh.exec` 增加 `stdout.channel.settimeout(120)`：远端命令 hang 时快速失败返回错误标记，不再无限阻塞。巡检/采集等批量任务不会被单条命令卡死、事务永不提交（曾导致巡检数据 0 入库）。超时与连接超时（15s）双层兜底。

## 5.3 ID 生成（防主键冲突）

原 `generate_secure_numeric_id` 为 6-8 位纯随机数字，ops_service_patrol 表 2 万+ 条后出现主键 Duplicate 冲突（整轮巡检挂掉）。现改为**进程内单调递增的相对毫秒时间戳（2026 起，11 位）**：同毫秒批量生成自动 +1，进程内绝对唯一，重启后时间单调不重复。

## 5.4 工单独立事务（防锁冲突）

告警自动创建工单原在巡检长事务内（持有 work_order 行锁到巡检结束），导致工单超时任务 `Lock wait timeout (1205)`。现工单使用独立 `AsyncSessionLocal` 会话提交：锁立即释放，且工单创建更可靠。

## 5.5 异常兜底链

```
单条 SSH 命令失败   → 超时/错误标记，继续采集
单服务采集失败      → is_running=None 不误报"服务已停止"，记录标记异常
整台服务器异常      → 捕获 + rollback → 写"巡检异常"记录 + 中危告警
整轮任务异常        → 逐台已提交数据保留，其余回滚
```
