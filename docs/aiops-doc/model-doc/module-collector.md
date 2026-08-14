# 数据采集引擎模块文档（Collector）

> **代码行数**: ~3000 | **文件数**: 20 | **最后更新**: 2026-08-08

---

## 一、模块定位

与服务巡检（opscenter）互补：巡检是"健康快照"（系统资源 + 服务启停 + 规则判警），**采集是"深度指标"**（QPS/命中率/连接数/容器数/慢查询等），为 statistics 模块的趋势分析、容量预测、健康评分提供数据源。

```
定时/手动触发 → SSH 连接 → 服务发现（四层探测）→ 并发采集各服务指标
  → ops_collector_record（本轮汇总）+ ops_collector_detail（每服务指标 JSON）
  → statistics 消费明细做分析
```

---

## 二、文件结构

```
aiops/collector/
├── collectors/                    ← 各服务采集器（Java/Nginx/Docker/Redis/MySQL）
├── discovery.py                   ← 服务发现（四层探测，并行化）
├── model/                         ← ops_collector_record / ops_collector_detail
├── router/ops_collector.py        ← API 路由
└── service/
    ├── collector_service.py       ← 记录 CRUD + 配置读写 + 定时调度入口（265 行）
    ├── collector_trigger.py       ← ★ 采集编排（trigger_collection/trigger_collect_all）
    └── collector_parallel.py      ← ★ 并发采集辅助（每服务独立连接 + 信号量）
```

---

## 三、核心流程

### 3.1 触发链路（三种入口）

```
① 定时：run_scheduled_collection（每分钟唤醒）
      → 读配置中心 collector_cron 的 enabled + cron
      → match_cron 命中 → trigger_collect_all(task_type="scheduled")
② 手动单台：POST /opsCollector/trigger/{serverId} → trigger_collection
③ 手动全量：POST /opsCollector/triggerAll → trigger_collect_all(task_type="manual")
```

### 3.2 单台采集（trigger_collection）

```
① 创建采集记录（status=running，失败也入库）
② 查服务器（opscenter api/）+ 查启用凭证（opscenter api/）
③ SSH 连接 → 服务发现（discover_services，5 类并行探测 3 秒）
     四层探测：systemctl 单元 → ps 进程 → 监听端口 → 配置文件，任一层命中即算已安装
④ 服务并发采集（collector_parallel.collect_services_concurrent）：
     每服务独立 SSH 连接 + Semaphore(4) 限流（避免超 sshd MaxSessions）
     dispatch_collector(ssh, type, name) → CollectorResult(base/runtime/config/metrics/extra/errors)
⑤ 串行写库（db 不并发共享 session）：
     有 errors → collect_status="failed"（命令级失败标记，已采数据仍保留）
     无采集器 → 仅基础发现信息
⑥ 更新记录：total/success/failed + services_discovered → status=completed
```

**★ 命令级失败标记（CollectorResult.errors）**：如 redis INFO 无返回、nginx 状态页未开启、docker stats 失败——`collect_status` 标记 failed 但**不静默写 0**，已采到的数据保留，detail 落 error_message。与 statistics 的"无数据"评分标记配合，防止采集失败被误判为健康。

### 3.3 采集器（collectors/）

| 采集器 | 核心指标 |
|---|---|
| mysql | 版本/端口/连接数/慢查询（P99：socket 探测 `SHOW STATUS`） |
| redis | 版本/端口/配置路径 |
| nginx | 版本/进程数/配置路径/监听端口 |
| docker | 运行中/停止容器数/镜像数/磁盘占用（system df） |
| java | 版本/进程数 |

---

## 四、配置（配置中心 collector_cron）

| key | 默认 | 说明 |
|---|---|---|
| `collector_cron` | `0 0 2 * * ?` | 定时全量采集 cron，`enabled` 字段为总开关 |

**热生效**：采集任务为 internal 模式——每分钟唤醒内部 `match_cron` 匹配，cron/enabled 修改即时生效；调度器热同步还会对 enabled=0 做 pause 优化（省去每分钟空转）。

---

## 五、并发改造（2026-08-08）

**背景**：原实现单连接逐服务串行采集，一台服务器 4 个服务实测 3 分钟（docker `system df` 等重命令单条 30-120s），每轮定时采集期间其余分钟调度全部被 max_instances=1 跳过。

**改造**：
1. 服务发现 5 类并行探测（单连接多 channel，17 秒 → 3 秒）
2. 服务采集每服务独立 SSH 连接 + `Semaphore(4)` 并发（`collector_parallel.py`）
3. 采集完**串行写库**（db 操作不可并发共享 session）
4. 单服务异常隔离：返回 error 标记，不影响其他服务
5. SSH 命令超时 30s → **120s**（docker system df 完整执行窗口）

**效果**：一台服务器 3 分钟 → **1 分 47 秒**（剩余耗时由 docker system df 主导，属预期）。

---

## 六、接口清单（/admin/opsCollector）

| 接口 | 说明 |
|---|---|
| trigger/{serverId} | 手动采集单台 |
| triggerAll | 手动全量采集 |
| list/{page}/{limit} | 采集记录分页 |
| detail/{recordId} | 记录详情（含各服务明细） |
| detailById/{detailId} | 单条明细 |
| remove/{id} / batchRemove | 删除记录 |
| config | 配置读取/保存 |

---

## 七、跨模块调用

| 调用 | 方向 | 用途 |
|---|---|---|
| opscenter api/server_query_api | collector → opscenter | 在线服务器/凭证查询 |
| opscenter api/credential_query_api | collector → opscenter | 解密凭证 |
| configuration api/config_query_api | collector → configuration | collector_cron 配置 |
| statistics | statistics → collector | `query_details_for_analysis` 消费明细做分析 |

---

## 八、要点

1. **巡检 vs 采集分工**：健康快照 vs 深度指标，各有独立 cron 和存储
2. **四层服务发现**降低误判率
3. **命令级失败标记**：不静默写 0，防"假健康"
4. **并发采集**：每服务独立连接 + 信号量限流 + 串行写库（db 安全），3 分钟 → 1 分 47 秒
5. **120s 命令超时兜底**：重命令完整执行，真 hang 不无限卡
