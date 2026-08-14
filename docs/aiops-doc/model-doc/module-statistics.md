# AIops — statistics 数据统计与分析模块

> 版本：v1.0 | 更新时间：2026-07-19 | 作者：lx
>
> **statistics 模块依托于 collector（采集数据）、server（巡检数据）、dbcenter（备份数据）提供统一的数据统计查询和智能分析能力**。从多个数据源聚合统计信息，结合趋势分析和异常检测算法，将原始指标数据转化为可读的统计报表和可视化图表。

---

# 一、需求分析

## 1.1 业务背景

AIops 平台运行一段时间后，各个模块积累了大量的运行数据：

- **服务巡检数据**（ops_service_patrol）：每次巡检的 CPU/内存/磁盘/服务状态
- **数据采集数据**（ops_collector_record）：Java/Nginx/Docker/Redis/MySQL 的运行指标
- **备份数据**（ops_database_backup）：备份成功/失败/大小/耗时
- **告警数据**（ops_alarm）：告警次数/类型/处理率/响应时间

这些原始数据的价值需要通过统计分析来挖掘。运维团队需要知道：

- 哪些服务器最不稳定？
- 数据库备份成功率是多少？
- 告警趋势是上升还是下降？
- CPU/内存使用趋势是否接近阈值？

## 1.2 功能需求清单

| 需求编号 | 功能 | 说明 |
|----------|------|------|
| STAT-01 | 服务巡检统计 | 巡检总数/成功率/失败率/异常分布 |
| STAT-02 | 备份统计 | 备份总数/成功率/失败数/最新备份评分 |
| STAT-03 | 告警统计 | 告警总数/已处理率/类型分布/响应时间 |
| STAT-04 | 数据库巡检统计 | 数据库巡检总数/平均评分/异常数 |
| STAT-05 | 资源分析 | CPU/内存/磁盘使用趋势 + 历史对比 |
| STAT-06 | 容量预测 | 基于历史数据预测资源耗尽时间 |
| STAT-07 | 趋势分析 | 多维度时间序列趋势（告警/巡检/备份） |
| STAT-08 | 异常检测 | 自动识别指标异常波动 |
| STAT-09 | 稳定性评分 | 综合多指标计算服务器稳定性得分 |
| STAT-10 | 分析持久化 | 定时将分析结果写入 ops_analysis_record |
| STAT-11 | Dashboard 摘要 | 为 Dashboard 提供聚合统计数据 |
| STAT-12 | 工单统计（★ 2026-08 新增） | 工单总数/待处理/待审核/审核不通过/超时/处理率 + 来源/优先级分布 + 处理人绩效率 |

---

# 二、系统设计

## 2.1 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                 statistics 模块                           │
│  依托于: collector(采集数据) + server(巡检数据)            │
│          + dbcenter(备份数据) + auth(告警数据)             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  数据源层        统计查询层         分析引擎层             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │巡检记录   │→│ 巡检统计      │  │ 资源趋势分析       │   │
│  │采集记录   │→│ 采集统计      │  │ 容量预测           │   │
│  │备份记录   │→│ 备份统计      │  │ 异常检测           │   │
│  │告警记录   │→│ 告警统计      │  │ 稳定性评分         │   │
│  │数据库巡检 │→│ DB巡检统计    │  │ Dashboard 摘要     │   │
│  └──────────┘  └──────────────┘  └──────────────────┘   │
│                                          ↓              │
│                               ops_analysis_record        │
│                               (分析结果持久化)            │
│                                          ↓              │
│                               AI 模块 (智能分析)          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  调度: APScheduler (每5分钟) → 自动执行分析并持久化        │
└──────────────────────────────────────────────────────────┘
```

## 2.2 数据库设计

```
ops_analysis_record (分析记录表)
  ├── id, analysis_type (resource/capacity/trend/anomaly/stability/score)
  ├── target_type (server/database), target_id
  ├── target_name, analysis_data (JSON: 完整分析结果)
  ├── summary (分析摘要), status (1=成功/2=失败)
  ├── analysis_time, create_time
  └── is_deleted
```

## 2.3 统计查询设计

### 服务巡检统计

```sql
-- 数据源: ops_service_patrol
SELECT
    COUNT(*)                            AS total_checks,
    SUM(CASE WHEN inspection_result = 1 THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN inspection_result = 2 THEN 1 ELSE 0 END) AS fail_count,
    AVG(cpu_usage)                      AS avg_cpu,
    AVG(CAST(disk_usage AS DECIMAL))    AS avg_disk
FROM ops_service_patrol
WHERE is_deleted = 0
  AND create_time >= :start_time
```

### 备份统计

```sql
-- 数据源: ops_database_backup
SELECT
    COUNT(*)                              AS total_backups,
    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) AS fail_count,
    AVG(file_size)                        AS avg_size
FROM ops_database_backup
WHERE is_deleted = 0
  AND end_time >= :start_time
```

### 告警统计

```sql
-- 数据源: ops_alarm
SELECT
    COUNT(*)                                  AS total_alarms,
    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS handled_count,
    SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS pending_count,
    alarm_type_name                           AS alarm_type
FROM ops_alarm
WHERE is_deleted = 0
  AND create_time >= :start_time
GROUP BY alarm_type_name
```

### 数据库巡检聚合统计

```sql
-- 数据源: ops_database_check_record
SELECT
    COUNT(*)                            AS total_checks,
    SUM(CASE WHEN check_status = 1 THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN check_status = 2 THEN 1 ELSE 0 END) AS fail_count,
    AVG(health_score)                   AS avg_score
FROM ops_database_check_record
WHERE is_deleted = 0
```

## 2.4 分析引擎设计

### 资源趋势分析

```
输入: 指定服务器的最近 N 次巡检/采集记录
算法:
  1. 提取 CPU/内存/磁盘时间序列
  2. 线性回归拟合趋势线
  3. 计算斜率 → 判断趋势方向（上升/下降/平稳）
  4. 预测达到阈值的时间点
输出:
  {
    "cpu": { "trend": "up", "slope": 0.5, "reach_threshold_in_days": 30 },
    "memory": { "trend": "stable", "slope": 0.1 },
    "disk": { "trend": "up", "slope": 0.8, "reach_threshold_in_days": 15 }
  }
```

### 容量预测

```
输入: 磁盘使用率历史数据
算法:
  1. 按天聚合磁盘使用率
  2. 线性回归: y = ax + b
  3. 解方程: threshold = a * days + b → days = (threshold - b) / a
输出: "预计 15 天后磁盘达到 90%"
```

### 异常检测

```
输入: 多指标时间序列
算法:
  1. 计算滑动窗口均值 + 标准差
  2. 当前值 > 均值 + 2σ → 异常高
  3. 当前值 < 均值 - 2σ → 异常低
  4. 标记异常时间点
输出: [{ "time": "...", "metric": "cpu", "value": 95, "is_anomaly": true }]
```

### 稳定性评分

```
输入: 服务器所有巡检记录
计算:
  score = 100
  - (异常巡检次数 / 总巡检次数) * 60     # 异常率扣分
  - (告警次数 / 总巡检次数) * 30         # 告警率扣分
  - CPU变异系数 * 5                      # CPU波动扣分
  - 内存变异系数 * 5                     # 内存波动扣分
  = 稳定性得分 (0-100)
```

## 2.5 分析持久化流程

```
APScheduler (每5分钟)
  ↓
run_scheduled_analysis()
  ↓
遍历所有启用分析的服务器/数据库:
  ├── 资源趋势分析 → 写入 ops_analysis_record
  ├── 容量预测     → 写入 ops_analysis_record
  ├── 异常检测     → 写入 ops_analysis_record
  ├── 稳定性评分   → 写入 ops_analysis_record
  └── Dashboard摘要 → 写入 ops_analysis_record
  ↓
前端 Dashboard / 统计页面查询 ops_analysis_record
```

---

# 三、核心实现

## 3.1 目录结构

```
aiops/statistics/
├── model/
│   └── ops_analysis_record.py         # 分析记录数据模型
│
├── router/                            # 路由层（2 文件）
│   ├── statistics_router.py           # 统计查询接口
│   └── analysis_router.py             # 数据分析接口
│
├── schemas/                           # Pydantic
│
└── service/                           # 业务逻辑（2 文件）
    ├── statistics_service.py          # 统计查询服务
    └── analysis_service.py            # ★ 分析引擎（1425行，最复杂的服务文件）
```

## 3.2 关键实现：分析引擎

`analysis_service.py` (1425 行) — 模块最核心文件：

```
run_scheduled_analysis()               # 定时分析入口（APScheduler）
  ├── _analyze_resource_trend()        # 资源趋势分析
  ├── _analyze_capacity()              # 容量预测
  ├── _analyze_trend()                 # 多维度趋势分析
  ├── _detect_anomalies()              # 异常检测
  ├── _calculate_stability_score()     # 稳定性评分
  ├── _generate_dashboard_summary()    # Dashboard 摘要
  └── _persist_analysis_record()       # 分析结果持久化

API 调用:
  analyze_resource()                   # POST /statistics/analysis/resource
  analyze_capacity()                   # POST /statistics/analysis/capacity
  analyze_trend()                      # POST /statistics/analysis/trend
  detect_anomalies()                   # POST /statistics/analysis/anomaly
  calculate_stability()                # POST /statistics/analysis/stability
  get_dashboard_summary()              # POST /statistics/analysis/dashboard
  get_dashboard_score()                # 综合评分
  get_analysis_records()               # 查询历史分析记录
  get_analysis_summary()               # 分析摘要
```

---

# 四、API 接口清单

## 4.1 统计查询

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/statistics/patrol` | 服务巡检统计 |
| GET | `/statistics/backup` | 备份统计 |
| GET | `/statistics/alarm` | 告警统计 |
| GET | `/statistics/dbCheck` | 数据库巡检统计 |

## 4.2 数据分析

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/statistics/analysis/resource` | 资源趋势分析 |
| POST | `/statistics/analysis/capacity` | 容量预测 |
| POST | `/statistics/analysis/trend` | 趋势分析 |
| POST | `/statistics/analysis/anomaly` | 异常检测 |
| POST | `/statistics/analysis/stability` | 稳定性评分 |
| POST | `/statistics/analysis/dashboard` | Dashboard 摘要数据 |
| GET | `/statistics/analysis/records` | 查询历史分析记录 |
| GET | `/statistics/analysis/summary` | 分析摘要 |

## 4.3 AI 数据分析（★ 2026-08 新增）

把「分析记录 ops_analysis_record + 采集数据 ops_collector_detail/record」聚合后交给大模型生成 Markdown 分析报告，报告保存到 `ops_ai_analysis_report` 可回看，支持 MD/Excel 导出（导出走后端接口权限校验）。

| 方法 | 路径 | 权限标识 | 功能 |
|------|------|---------|------|
| POST | `/admin/aiDataAnalysis/generate/stream` | bnt.aiDataAnalysis.generate | 流式生成 AI 数据分析报告（SSE） |
| POST | `/admin/aiDataAnalysis/generate` | bnt.aiDataAnalysis.generate | 同步生成并保存报告 |
| GET | `/admin/aiDataAnalysis/list` | bnt.aiDataAnalysis.list | 报告历史分页 |
| GET | `/admin/aiDataAnalysis/detail/{id}` | bnt.aiDataAnalysis.list | 报告详情 |
| DELETE | `/admin/aiDataAnalysis/delete/{id}` | bnt.aiDataAnalysis.generate | 删除报告（软删） |
| POST | `/admin/aiDataAnalysis/exportMd` | bnt.aiDataAnalysis.export | 导出 Markdown 报告文件 |
| POST | `/admin/aiDataAnalysis/exportExcel` | bnt.aiDataAnalysis.export | 导出 Excel 汇总（分析记录+采集数据两 sheet） |

**核心文件**：`service/ai_analysis_data_aggregator.py`（数据聚合）→ `service/ai_data_analysis_service.py`（生成/保存/查询/导出，大模型走 `llm_client.asyncio_astream/ainvoke`，scene=`data_analysis`）→ `service/ai_data_analysis_prompts.py`（提示词与文本格式化）→ `model/ops_ai_analysis_report.py`（报告表）。

---

# 五、解决的问题

## 5.1 数据孤岛打通

- **跨模块聚合**：statistics 模块是平台唯一跨 4 个数据源（巡检/采集/备份/告警）进行聚合统计的模块
- **统一统计口径**：所有统计计算在 statistics 模块完成，避免前端各自计算导致数据不一致
- **Dashboard 数据单一来源**：Dashboard 页面所有数据从 statistics 接口获取，数据流清晰

## 5.2 历史趋势可见

- **时间序列分析**：不再是"当前 CPU 是多少"，而是"过去 30 天 CPU 增长了 15%"
- **容量预测**：基于线性回归提前预知资源耗尽时间，主动扩容而不是被动告警
- **异常检测**：自动标记偏离正常范围的指标波动，运维不需要肉眼对比历史数据

## 5.3 分析结果持久化

- **避免重复计算**：分析结果写入 `ops_analysis_record`，前端直接查询缓存结果
- **历史分析可追溯**：任意时间点的分析结果都可回溯
- **定时自动执行**：APScheduler 每 5 分钟自动更新分析，Dashboard 始终是最新数据

## 5.4 稳定性量化

- **100 分制稳定性评分**：将定性感受（"这个服务器不稳定"）量化为可比较的分数
- **多维度加权**：异常率 60% + 告警率 30% + CPU波动 5% + 内存波动 5%
- **排行榜**：最差服务器一目了然，资源投入有数据支撑

---

# 六、与上游模块的依赖关系

```
server 提供                     statistics 使用
─────────────────────────────────────────────
ops_service_patrol             → 服务巡检统计
ops_alarm                      → 告警统计 + 告警率计算

dbcenter 提供                  statistics 使用
─────────────────────────────────────────────
ops_database_backup            → 备份统计
ops_database_check_record      → 数据库巡检统计 + 平均评分

collector 提供                 statistics 使用
─────────────────────────────────────────────
ops_collector_record           → 采集数据趋势分析

auth 提供                      statistics 使用
─────────────────────────────────────────────
Depends(require_perms(...))    → bnt.statistics.* 权限
```

---

# 七、模块依赖全景图

```
                    ┌─────────────┐
                    │    auth     │ (基石: 认证 + 权限 + 审计)
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌──────▼──────┐   ┌─────▼─────┐
    │  server   │   │  dbcenter   │   │ 前端 UI   │
    │ (巡检引擎) │   │ (备份/巡检) │   │(Vue3+TS)  │
    └─────┬─────┘   └──────┬──────┘   └───────────┘
          │                │
    ┌─────▼─────┐         │
    │ collector │         │
    │ (数据采集) │         │
    └─────┬─────┘         │
          │               │
          └───────┬───────┘
                  │
          ┌───────▼───────┐
          │  statistics   │ (跨模块聚合统计 + 分析引擎)
          └───────┬───────┘
                  │
          ┌───────▼───────┐
          │      AI       │ (智能分析 + RAG + DB助手)
          └───────────────┘
```
